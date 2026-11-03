import * as fs from "node:fs";
import * as path from "node:path";

import { writeHeadersFile, type SecurityHeadersOptions } from "./security-headers";
import { validateSlug } from "./wrangler-config";

/**
 * Site comments on STAGING builds, and only there.
 *
 * The portal serves a dependency-free overlay (`/site-comments/v1.js`, portal ADR 0016) that
 * lets a client pin comments on the staging site. A site opts in with one tag. This module
 * adds that tag to a staging `out/` and removes it again, so a production artifact never
 * contains it and never carries the CSP grant that goes with it.
 *
 * Why strip as well as apply: on the Mac path STAGING and DEPLOY ship the same `out/` (the
 * manifest guard in `artifact.ts`). STAGING therefore records its manifest of the
 * production form first, then applies the overlay for the upload; DEPLOY strips it, rebuilds
 * `_headers` and compares against that manifest. The tag is inserted as one exact string
 * directly before `</body>`, so removing it restores the original bytes.
 *
 * CSP: the page scan already allows an external `<script src>` origin in that page's
 * `script-src`; the only extra grant is the portal origin in `connect-src`
 * (`SecurityHeadersOptions.siteCommentsOrigin`). Neither exists unless the tag does.
 */

/** The two portal hosts a client can be sold on (portal `src/lib/brand.ts`). */
export const PORTAL_HOSTS = ["app.tasteled.com", "portal.aethrdesign.com"] as const;
export type PortalHost = (typeof PORTAL_HOSTS)[number];

const MARKER = "data-aethr-site-comments";
const OVERLAY_PATH = "/site-comments/v1.js";
const TAG_PATTERN = new RegExp(`<script\\b[^>]*\\b${MARKER}\\b[^>]*></script>`, "gi");
/** Editor preview shells are framed by the portal editor; the overlay has no business there. */
const PREVIEW_SHELL = /(?:^|\/)(?:cms-preview|ae-preview)(?:\/index)?\.html$/;

export function isPortalHost(value: string | undefined): value is PortalHost {
  return (PORTAL_HOSTS as readonly string[]).includes(value ?? "");
}

export function siteCommentsOrigin(portalHost: string): string {
  if (!isPortalHost(portalHost)) {
    throw new Error(`Unknown portal host "${portalHost}"; expected one of ${PORTAL_HOSTS.join(", ")}.`);
  }
  return `https://${portalHost}`;
}

export function siteCommentsTag({ slug, portalHost }: { slug: string; portalHost: string }): string {
  const problem = validateSlug(slug);
  if (problem) throw new Error(`Invalid slug "${problem.slug}": it ${problem.reason}.`);
  return `<script src="${siteCommentsOrigin(portalHost)}${OVERLAY_PATH}" data-client="${slug}" ${MARKER} defer></script>`;
}

function htmlFiles(dir: string, base = dir): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full, base));
    else if (entry.isFile() && entry.name.endsWith(".html")) found.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return found.sort();
}

/** Removes the overlay tag from every page; returns how many pages changed. */
export function stripSiteComments(outDir: string): number {
  const root = path.resolve(outDir);
  let changed = 0;
  for (const file of htmlFiles(root)) {
    const target = path.join(root, file);
    const html = fs.readFileSync(target, "utf-8");
    const stripped = html.replace(TAG_PATTERN, "");
    if (stripped !== html) {
      fs.writeFileSync(target, stripped, "utf-8");
      changed++;
    }
  }
  return changed;
}

/** Pages that still reference the overlay, by marker or by script path. */
export function pagesWithSiteComments(outDir: string): string[] {
  const root = path.resolve(outDir);
  return htmlFiles(root).filter((file) => {
    const html = fs.readFileSync(path.join(root, file), "utf-8");
    return html.includes(OVERLAY_PATH) || html.includes(MARKER);
  });
}

/** Production guard: the overlay is a staging tool, so a production artifact must not carry it. */
export function assertNoSiteComments(outDir: string): void {
  const pages = pagesWithSiteComments(outDir);
  if (pages.length) {
    throw new Error(
      `The site-comments overlay is in a production artifact (${pages.slice(0, 5).join(", ")}${pages.length > 5 ? ", …" : ""}). ` +
        "It is staging-only; rebuild or strip it before publishing.",
    );
  }
}

export interface StagingSiteComments {
  slug: string;
  portalHost: string;
}

/**
 * Adds the overlay tag to every page of a staging `out/` and rewrites `_headers` with the
 * portal origin in `connect-src`. Idempotent. Pass the same `headerOptions` the production
 * form of `_headers` was written with.
 */
export function applyStagingSiteComments(
  outDir: string,
  site: StagingSiteComments,
  headerOptions: SecurityHeadersOptions = {},
): { pages: number; origin: string } {
  const root = path.resolve(outDir);
  const tag = siteCommentsTag(site);
  const origin = siteCommentsOrigin(site.portalHost);

  stripSiteComments(root);
  let pages = 0;
  for (const file of htmlFiles(root)) {
    if (PREVIEW_SHELL.test(file)) continue;
    const target = path.join(root, file);
    const html = fs.readFileSync(target, "utf-8");
    const at = html.lastIndexOf("</body>");
    if (at === -1) continue;
    fs.writeFileSync(target, html.slice(0, at) + tag + html.slice(at), "utf-8");
    pages++;
  }
  if (pages === 0) throw new Error(`No page with a </body> in ${root}; the site-comments tag was not installed.`);

  writeHeadersFile(root, { ...headerOptions, siteCommentsOrigin: origin });
  return { pages, origin };
}

/** The Business client folder's `state.md`, read for the two fields STAGING needs. */
function statePath(slug: string, vaultRoot: string): string {
  return path.join(vaultRoot, "Business/clients", slug, "state.md");
}

/** `portal-host:` from a client's frontmatter, or undefined when absent or not a known host. */
export function readPortalHost(slug: string, vaultRoot: string): PortalHost | undefined {
  const file = statePath(slug, vaultRoot);
  if (!fs.existsSync(file)) return undefined;
  const match = fs.readFileSync(file, "utf-8").match(/^portal-host:[ \t]*["']?([^"'\s#]+)/m);
  return isPortalHost(match?.[1]) ? match![1] : undefined;
}

export type StagingLinkResult = "written" | "unchanged" | "kept-existing" | "no-state" | "no-field";

/**
 * Registers the staging origin with the portal: the portal reads `Staging URL:` from the
 * `## Links` block and, once it is set, shows "Open your site to comment" on the client
 * dashboard. Fills an empty field only; a link someone already wrote is left alone.
 */
export function registerStagingLink(slug: string, url: string, vaultRoot: string): StagingLinkResult {
  const file = statePath(slug, vaultRoot);
  if (!fs.existsSync(file)) return "no-state";
  const text = fs.readFileSync(file, "utf-8");
  const section = text.match(/^## Links[ \t]*\n[\s\S]*?(?=^## |(?![\s\S]))/m);
  if (!section) return "no-field";
  const field = section[0].match(/^([ \t]*-[ \t]*Staging URL:)[ \t]*(.*)$/m);
  if (!field) return "no-field";
  const current = field[2].trim();
  if (current.includes(url)) return "unchanged";
  if (current && !/^<!--.*-->$/.test(current)) return "kept-existing";
  const updatedSection = section[0].replace(field[0], `${field[1]} ${url}`);
  fs.writeFileSync(file, text.replace(section[0], updatedSection), "utf-8");
  return "written";
}
