import * as fs from "node:fs";
import * as path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod/v4";

import { siteSpecSchema, type SiteSpec } from "../src/lib/assembly/site-spec";
import { SECTION_PROP_SCHEMAS, type SectionType } from "../src/lib/assembly/section-props";
import { buildInventory } from "../src/lib/edit/spec-adapter";
import type { EditMarkers } from "../src/lib/edit/markers";
import { SECTION_COMPONENTS, PreviewFooter, PreviewHeader, previewNav } from "../src/lib/edit/preview";
import { SITE_HEADER_MARKERS } from "../src/components/layout/header";
import { SITE_FOOTER_MARKERS } from "../src/components/layout/footer";

/**
 * Proves the two properties Phase 3 rests on: **a built site is unchanged**, and **every
 * free field is reachable on the canvas**.
 *
 * The assembled carrier's editor needs the rendered page to say which field each element
 * came from, and the fourteen section components now emit `data-ae` to say so. They emit
 * it only when the preview passes an `edit` prop, and `generate.ts` never does — so the
 * claim is that a client's deployed HTML is byte-for-byte what it was before the markers
 * existed. That claim is checked here rather than asserted in a comment:
 *
 * 1. **Off.** No `data-ae` anywhere, and the whole render equals a baseline captured from
 *    the commit *before* this phase (`scripts/fixtures/edit-markers-baseline.html`,
 *    rendered in a `git worktree` at that commit). Regenerating it with `--update` is a
 *    deliberate act: it means a section's markup changed, and every shipped site's HTML
 *    changes with it.
 * 2. **On.** Every field id the spec reader emits for a section appears exactly once in
 *    the markup, and no marker names a path the reader does not know. The first half
 *    catches a prop nobody wrapped; the second catches a wrapped prop whose path is a
 *    typo, which is the failure that would otherwise surface as a silently dead click.
 *
 * The fixture is the fourteen-section sample with **every optional prop filled in**,
 * derived by walking the Zod schemas rather than hand-written — so a prop added to a
 * schema is covered by this check the moment it exists, with nothing to remember.
 *
 *   npx tsx scripts/check-edit-markers-parity.ts [--update]
 */

const SAMPLE = path.join(__dirname, "../src/lib/assembly/sample-specs/_all-sections.json");
const BASELINE = path.join(__dirname, "fixtures/edit-markers-baseline.html");

/** Frozen so the baseline does not change by itself on New Year's Day. */
const FIXTURE_YEAR = 2026;

/**
 * Fields whose marker exists in the component but not in a server render of it.
 *
 * Not an exemption from coverage — the marker is there, the element is not, and the
 * difference matters to the client only in that they open the question first.
 */
const RENDER_GATED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\.items\[\d+\]\.answer$/,
    why: "base-ui unmounts a collapsed accordion panel; the marker renders when the client opens that question",
  },
];

/** Site-wide fields the page chrome renders. Not once-only: the name is header AND footer. */
const SITE_IDS = new Set([
  "client.name",
  "client.tagline",
  "client.social.facebook",
  "client.social.instagram",
  "client.social.linkedin",
  "client.social.twitter",
]);

/* ── the fixture ─────────────────────────────────────────────────────────── */

type AnySchema = z.ZodType & {
  shape?: Record<string, AnySchema>;
  element?: AnySchema;
  unwrap?: () => AnySchema;
  options?: unknown[];
};

function typeOf(schema: AnySchema): string {
  return (schema as unknown as { _zod: { def: { type: string } } })._zod.def.type;
}

function unwrap(schema: AnySchema): AnySchema {
  let inner = schema;
  while (
    typeof inner.unwrap === "function" &&
    ["optional", "default", "nullable"].includes(typeOf(inner))
  ) {
    inner = inner.unwrap();
  }
  return inner;
}

/** The given value with every absent optional filled in, so nothing is unrendered. */
function fill(schema: AnySchema, value: unknown, name: string): unknown {
  const inner = unwrap(schema);
  const kind = typeOf(inner);

  if (kind === "object") {
    const out: Record<string, unknown> = {};
    const current = (value ?? {}) as Record<string, unknown>;
    for (const [key, child] of Object.entries(inner.shape ?? {})) {
      out[key] = fill(child, current[key], key);
    }
    return out;
  }

  if (kind === "array") {
    const element = inner.element as AnySchema;
    const items = Array.isArray(value) && value.length > 0 ? value : [undefined, undefined];
    return items.map((item, index) => fill(element, item, `${name} ${index + 1}`));
  }

  // `sections` is a discriminated union — without this branch a section's props come
  // through untouched and every optional prop the sample omits is silently uncovered.
  if (kind === "union") {
    const options = (inner as unknown as { _zod: { def: { options: AnySchema[] } } })._zod.def
      .options;
    const discriminator = (value as { type?: string } | undefined)?.type;
    const chosen =
      options.find((option) => {
        const literal = unwrap(option).shape?.type as AnySchema | undefined;
        if (!literal) return false;
        const values = (literal as unknown as { _zod: { def: { values?: unknown[] } } })._zod.def
          .values;
        return values?.[0] === discriminator;
      }) ?? options[0];
    return fill(chosen, value, name);
  }

  if (kind === "enum") {
    const options = (inner as unknown as { _zod: { def: { entries: Record<string, string> } } })
      ._zod.def.entries;
    return value ?? Object.values(options)[0];
  }
  if (kind === "boolean") return value ?? true;
  if (kind === "string") return value ?? `Fixture ${name}`;
  return value;
}

function fixtureSpec(): SiteSpec {
  const sample = JSON.parse(fs.readFileSync(SAMPLE, "utf8")) as Record<string, unknown>;
  const filled = fill(siteSpecSchema as unknown as AnySchema, sample, "spec");
  const parsed = z.safeParse(siteSpecSchema, filled);
  if (!parsed.success) {
    throw new Error(`The fixture does not parse:\n${z.prettifyError(parsed.error)}`);
  }
  // Every section type, or the coverage half of this check is quietly partial.
  const present = new Set(parsed.data.pages.flatMap((p) => p.sections.map((s) => s.type)));
  const missing = Object.keys(SECTION_PROP_SCHEMAS).filter((type) => !present.has(type as SectionType));
  if (missing.length > 0) {
    throw new Error(`The fixture is missing section types: ${missing.join(", ")}`);
  }
  return parsed.data;
}

/* ── the render ──────────────────────────────────────────────────────────── */

/**
 * The same composition `site-preview.tsx` portals into the iframe: the site chrome around
 * the page's sections, each in the `<div id="<type>">` wrapper `generate.ts` emits.
 */
function renderPage(spec: SiteSpec, markers: boolean): string {
  const page = spec.pages[0];
  const scope = (prefix: string): EditMarkers | undefined =>
    markers ? { prefix } : undefined;

  return renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(PreviewHeader, {
        siteName: spec.client.name,
        nav: previewNav(spec),
        ...(markers ? { edit: SITE_HEADER_MARKERS } : {}),
      } as never),
      React.createElement(
        "main",
        null,
        ...page.sections.map((section, index) =>
          React.createElement(
            "div",
            { key: `${section.type}-${index}`, id: section.type },
            React.createElement(SECTION_COMPONENTS[section.type], {
              ...section.props,
              edit: scope(`pages[0].sections[${index}].props`),
            }),
          ),
        ),
      ),
      React.createElement(PreviewFooter, {
        companyName: spec.client.name,
        tagline: spec.client.tagline,
        copyright: `© ${FIXTURE_YEAR} ${spec.client.name}`,
        navLinks: previewNav(spec),
        socialLinks: spec.client.social ?? {},
        ...(markers ? { edit: SITE_FOOTER_MARKERS } : {}),
      } as never),
    ),
  );
}

/* ── the checks ──────────────────────────────────────────────────────────── */

function markersIn(html: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const match of html.matchAll(/data-ae="([^"]*)"/g)) {
    found.set(match[1], (found.get(match[1]) ?? 0) + 1);
  }
  return found;
}

function main(): void {
  const update = process.argv.includes("--update");
  const spec = fixtureSpec();
  const failures: string[] = [];

  /* 1 — off */
  const off = renderPage(spec, false);
  const strays = markersIn(off);
  if (strays.size > 0) {
    failures.push(`A built page carries markers: ${[...strays.keys()].join(", ")}`);
  }
  if (/data-ae-(type|item|slot|multiline|locked)=/.test(off)) {
    failures.push("A built page carries marker metadata with no `data-ae` beside it.");
  }

  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  if (update || !fs.existsSync(BASELINE)) {
    fs.writeFileSync(BASELINE, off);
    console.log(`baseline ${update ? "updated" : "created"}: ${path.relative(process.cwd(), BASELINE)}`);
  } else {
    const baseline = fs.readFileSync(BASELINE, "utf8");
    if (baseline !== off) {
      const at = [...baseline].findIndex((char, index) => char !== off[index]);
      failures.push(
        `A built page's HTML changed. First difference at byte ${at}:\n` +
          `  baseline: …${baseline.slice(Math.max(0, at - 60), at + 60)}…\n` +
          `  now:      …${off.slice(Math.max(0, at - 60), at + 60)}…\n` +
          `  If the markup change was intended, re-run with --update — every shipped site's HTML changes with it.`,
      );
    }
  }

  /* 2 — on */
  const on = renderPage(spec, true);
  const found = markersIn(on);
  const inventory = buildInventory(spec, "fixture");

  const expected = new Map<string, "field" | "list">();
  for (const group of inventory.pages.flatMap((page) => page.groups)) {
    for (const field of group.fields) expected.set(field.id, "field");
    for (const list of group.lists) expected.set(list.id, "list");
  }

  const gated: string[] = [];
  for (const [id, kind] of expected) {
    const count = found.get(id) ?? 0;
    if (count === 1) continue;
    if (count === 0) {
      const reason = RENDER_GATED.find((rule) => rule.pattern.test(id));
      if (reason) {
        gated.push(id);
        continue;
      }
      failures.push(`Unreachable on the canvas — no marker for the ${kind} \`${id}\`.`);
    } else {
      failures.push(`\`${id}\` is marked ${count} times; a field has one layer.`);
    }
  }

  for (const id of found.keys()) {
    if (expected.has(id) || SITE_IDS.has(id)) continue;
    failures.push(`\`${id}\` is marked but is not a field the reader knows — check the path.`);
  }
  for (const id of SITE_IDS) {
    if (!found.has(id)) failures.push(`The site chrome renders no marker for \`${id}\`.`);
  }

  const sections = new Set(inventory.pages.flatMap((p) => p.groups.map((g) => g.sectionType)));
  console.log(
    `${expected.size - gated.length}/${expected.size} field and list markers found across ` +
      `${sections.size} section types; ${SITE_IDS.size} site-chrome markers.`,
  );
  if (gated.length > 0) {
    console.log(`render-gated (marker present, element not rendered): ${gated.join(", ")}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):\n`);
    for (const failure of failures) console.error(`  • ${failure}\n`);
    process.exit(1);
  }
  console.log("Edit markers parity: OK");
}

main();
