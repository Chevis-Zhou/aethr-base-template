import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { computeManifest, type ArtifactManifest } from "../deploy/artifact";
import type { DeltaEntry } from "./pass";

/**
 * The annotated carrier's half of a change pass — ticket 031 §2.
 *
 * A hand-built site's document is its `content.json` against a `template.html`, and its
 * build, staging push and live push are scripts in the client's own folder rather than
 * `next build` and wrangler. Everything above BUILD is carrier-neutral, so this file is
 * only the four recipes plus the leaf diff, and `run.ts` picks between them on
 * `state.carrier`.
 *
 * Why the client's scripts and not a reimplementation: `deploy-mockup.sh` and
 * `deploy-live.sh` are what shipped the site and what the owner runs by hand today. A
 * second code path that assembled the same files differently would make the pass a
 * rehearsal of something nobody does.
 */

export interface AnnotatedSite {
  /** The client site root — the folder holding `mockup/`, `edit-layer/` and the scripts. */
  root: string;
  mockup: string;
  editLayer: string;
  content: string;
  stagingScript: string;
  liveScript: string;
  buildCss: string;
  /** The checkout `deploy-live.sh` syncs into — the one holding the apex's `CNAME`. */
  liveClone: string;
}

export function resolveSite(root: string): AnnotatedSite {
  const abs = path.resolve(root);
  const site: AnnotatedSite = {
    root: abs,
    mockup: path.join(abs, "mockup"),
    editLayer: path.join(abs, "edit-layer"),
    content: path.join(abs, "mockup", "content.json"),
    stagingScript: path.join(abs, "deploy-mockup.sh"),
    liveScript: path.join(abs, "deploy-live.sh"),
    buildCss: path.join(abs, "build-css.sh"),
    liveClone: "",
  };
  site.liveClone = findLiveClone(abs);
  for (const required of [site.mockup, site.editLayer, site.stagingScript, site.liveScript]) {
    if (!fs.existsSync(required)) {
      throw new Error(`--site-dir ${abs} is not a hand-built site: missing ${path.relative(abs, required)}`);
    }
  }
  return site;
}

/**
 * The client's words, into the working tree the scripts build from.
 *
 * The previous content is kept beside it, exactly as `publish-annotated.mjs` does: a pass
 * that fails anywhere between here and STAGING must leave the Vault mirror as it was,
 * rather than quietly editing the source of truth on the Mac.
 */
/**
 * The live checkout is found by its `CNAME`, not by name: it is the clone whose GitHub
 * Pages repo answers for the apex, and a staging clone beside it deliberately has none
 * (`deploy-mockup.sh`: a CNAME there would 301 staging to live).
 */
function findLiveClone(root: string): string {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (fs.existsSync(path.join(dir, ".git")) && fs.existsSync(path.join(dir, "CNAME"))) return dir;
  }
  return path.join(root, "(no live checkout on disk)");
}

export function writeContent(site: AnnotatedSite, content: unknown): () => void {
  const backup = `${site.content}.pre-pass`;
  if (fs.existsSync(site.content)) fs.copyFileSync(site.content, backup);
  fs.writeFileSync(site.content, `${JSON.stringify(content, null, 2)}\n`, "utf-8");
  return () => {
    if (!fs.existsSync(backup)) return;
    fs.copyFileSync(backup, site.content);
    fs.rmSync(backup, { force: true });
  };
}

export function dropBackup(site: AnnotatedSite): void {
  fs.rmSync(`${site.content}.pre-pass`, { force: true });
}

export function buildSite(site: AnnotatedSite): void {
  execFileSync("node", [path.join(site.editLayer, "build.mjs"), "--dir", site.mockup], { stdio: "inherit" });
  execFileSync(site.buildCss, [], { cwd: site.root, stdio: "inherit" });
}

/** The edit-layer contract — the same gate the client's own deploy scripts refuse on. */
export function validateSite(site: AnnotatedSite): { ok: boolean; output: string } {
  try {
    const output = execFileSync("node", [path.join(site.editLayer, "validate.mjs"), "--dir", site.mockup], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
}

/**
 * What the site actually ships: `index.html` plus `assets/` without `brand/`.
 *
 * Materialised into the pass folder rather than hashed in place, for the reason `out/`
 * exists on the assembled carrier — `mockup/` also holds the retired comparison builds,
 * the screenshots and the Tailwind sources, and hashing those would make the manifest
 * report drift every time an unrelated file moved.
 */
export function materialiseSurface(site: AnnotatedSite, passDir: string): string {
  const out = path.join(passDir, "out");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(site.mockup, "index.html"), path.join(out, "index.html"));
  copyDir(path.join(site.mockup, "assets"), path.join(out, "assets"), (rel) => !rel.startsWith("brand"));
  return out;
}

export function surfaceManifest(site: AnnotatedSite, passDir: string, slug: string): ArtifactManifest {
  return computeManifest(materialiseSurface(site, passDir), slug);
}

export function pushStaging(site: AnnotatedSite): void {
  execFileSync(site.stagingScript, [], { cwd: site.root, stdio: "inherit" });
}

export function pushLive(site: AnnotatedSite): void {
  execFileSync(site.liveScript, [], { cwd: site.root, stdio: "inherit" });
}

export interface LiveDiff {
  changed: string[];
  added: string[];
  removed: string[];
  cloneMissing: boolean;
}

/**
 * What `deploy-live.sh` would change, without changing it — ticket 031 §3.
 *
 * The live target is a repository the client's DNS serves, so DEPLOY rehearses unless the
 * owner passes `--live`. Comparing the built surface against the live checkout is the
 * closest honest answer to "what would this push", and it reads the clone without
 * fetching: a rehearsal must not move the owner's working tree either.
 *
 * `index.html` is compared through the same `noindex` → `index, follow` substitution the
 * live script applies, or every rehearsal would report the homepage as changed.
 */
export function diffAgainstLive(site: AnnotatedSite, surface: string): LiveDiff {
  const diff: LiveDiff = { changed: [], added: [], removed: [], cloneMissing: false };
  if (!fs.existsSync(path.join(site.liveClone, ".git"))) {
    diff.cloneMissing = true;
    return diff;
  }
  const staged = new Map<string, Buffer>();
  for (const rel of walk(surface)) {
    const bytes = fs.readFileSync(path.join(surface, rel));
    staged.set(rel, rel === "index.html" ? Buffer.from(liveIndex(bytes.toString("utf-8")), "utf-8") : bytes);
  }
  // `CNAME` and `.nojekyll` are written by the deploy script itself, not built from the
  // page — counting them as removals would report a deletion the push never makes.
  const scriptOwned = new Set(["CNAME", ".nojekyll"]);
  const live = new Set(walk(site.liveClone).filter((rel) => !scriptOwned.has(rel) && !rel.startsWith(".git")));

  for (const [rel, bytes] of staged) {
    if (!live.has(rel)) diff.added.push(rel);
    else if (!bytes.equals(fs.readFileSync(path.join(site.liveClone, rel)))) diff.changed.push(rel);
  }
  for (const rel of live) if (!staged.has(rel)) diff.removed.push(rel);
  return diff;
}

function liveIndex(html: string): string {
  return html.replace('content="noindex, nofollow"', 'content="index, follow"');
}

/**
 * Leaf diff over `content.json` — the annotated carrier's `diffSpecs`.
 *
 * Every field reachable here is free by definition: 012's amendment §B made **the
 * annotation itself** the partition, so a value that appears in `content.json` is one the
 * client can already edit. What a pass buys on this carrier is the markup — new sections,
 * new fields, layout — which lives in `template.html` and is reported separately.
 */
export function diffContent(before: unknown, after: unknown, at = ""): DeltaEntry[] {
  if (Object.is(before, after)) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      return [
        { path: at, change: "membership", free: true, before: `${before.length} item(s)`, after: `${after.length} item(s)` },
      ];
    }
    return before.flatMap((item, i) => diffContent(item, after[i], `${at}[${i}]`));
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      const child = at ? `${at}.${key}` : key;
      if (!(key in before)) return [{ path: child, change: "added" as const, free: true, after: after[key] }];
      if (!(key in after)) return [{ path: child, change: "removed" as const, free: true, before: before[key] }];
      return diffContent(before[key], after[key], child);
    });
  }

  return [{ path: at, change: "changed", free: true, before, after }];
}

/** The paid side of this carrier: the markup the annotations live in. */
export function templateDelta(before: string, after: string): DeltaEntry[] {
  if (before === after) return [];
  return [
    {
      path: "template.html",
      change: "changed",
      free: false,
      before: `${before.length} bytes`,
      after: `${after.length} bytes`,
    },
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walk(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    // `.git` is not shipped, and `.DS_Store` is Finder's, not the site's — comparing it
    // would report drift on every rehearsal run from a folder someone had opened.
    if (entry.name === ".git" || entry.name === ".DS_Store") return [];
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });
}

function copyDir(from: string, to: string, accept: (rel: string) => boolean, prefix = ""): void {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!accept(rel) || entry.name === ".DS_Store") continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest, accept, rel);
    else fs.copyFileSync(src, dest);
  }
}
