/**
 * The field-inventory contract — `id · type · constraints · current value`.
 *
 * Ticket 012's second 2026-09-09 amendment (§A) makes this the one seam the whole
 * self-edit design hangs on: there is ONE backend, and what varies per rung is three
 * leaves inside it. This file is the first of those three seams — the shape every
 * *reader* produces. `spec-adapter.ts` is reader #1, over the `SiteSpec` partition.
 * Reader #2, over Phase 1's annotation manifest for hand-built sites, produces this same
 * shape and is not written yet; nothing below may grow a `SiteSpec` assumption.
 *
 * Everything the editor UI knows about a site arrives through here. The UI never sees a
 * `SiteSpec`, never imports Zod, and never learns what a section type is.
 */

/** How the field is edited. Not what it is stored as — every value below is a string. */
export type FieldKind =
  | "text"
  | "textarea"
  /**
   * A restricted HTML subset, edited in a formatting control and filtered through
   * `lib/rich-text.ts` on write and again on render. Still one string in the document —
   * the kind changes the *control*, not the storage, which is why adding it needed no
   * schema change and no migration of any existing value.
   */
  | "richtext"
  | "image"
  /**
   * A URL the client owns — a `mailto:` on their own contact block, a `tel:`.
   *
   * Only reader #2 emits this. On the assembled side every link is paid, because a
   * `ctaHref` is the site's navigation and a wrong one silently kills a conversion path
   * (§1.1). On an annotated site the *annotation* is the partition (2026-09-09 amendment
   * §B), so a link the developer chose to annotate is one they decided the client owns.
   * The scheme allowlist rides along in `constraints.schemes`.
   */
  | "url"
  | "icon"
  | "string-list";

export interface FieldConstraints {
  required: boolean;
  /**
   * The sibling field that becomes this image's `alt` in the rendered markup.
   *
   * Specification §1.3 requires a non-empty alt before an upload can be saved. No image
   * field in `SiteSpec` carries its own alt — every section derives it from a text field
   * beside it (`projects[].title`, `testimonials[].author`, `about.founderName`), so the
   * constraint is "that field is non-empty", enforced in the control rather than failing
   * the client's publish on QA check 7.
   *
   * Absent for images that render no `<img>`: `hero.backgroundImage` is a CSS background
   * and `seo.defaultImage` is a meta tag.
   */
  altPath?: string;
  /** Closed vocabulary — the `icon` picker. A closed set cannot produce a broken state. */
  options?: readonly string[];
  /**
   * Character ceiling and floor, from the annotation's `data-ae-max` / `data-ae-min`.
   *
   * Not advisory: `edit-layer/SPEC.md` §5 makes `max` how a designer says "this headline
   * is on one line at 1280px" without the editor knowing anything about the design. The
   * assembled reader emits neither, because a Zod prop schema carries no such limit — the
   * absence is a fact about that substrate rather than a gap here.
   */
  maxLength?: number;
  minLength?: number;
  /** Allowed URL schemes for a `url` field — `https`, `mailto`, `tel`, `anchor`, … */
  schemes?: readonly string[];
}

export interface InventoryField {
  /** JSON path into the document, e.g. `pages[0].sections[2].props.services[1].title`. */
  id: string;
  kind: FieldKind;
  label: string;
  value: string;
  constraints: FieldConstraints;
}

/**
 * An editable array of small objects — services, projects, testimonials, FAQ items, stats.
 *
 * Add and remove are FREE (§1.4 ruling 2, which moved them off the $100 minor class), with
 * a floor of one: emptying a list is what produces the headed-but-empty section QA check 6
 * catches, and preventing it in the control beats blocking a publish over it.
 */
export interface InventoryList {
  /** Path of the array itself. */
  id: string;
  label: string;
  /** Singular noun for the add/remove controls — "service", "project". */
  itemLabel: string;
  count: number;
  min: number;
  /** Ceiling, where the carrier declares one (`data-ae-max-items`). */
  max?: number;
  /** Blank item to append, shaped so the result still parses. */
  template: Record<string, string>;
}

/**
 * A structural operation the client can see and cannot perform.
 *
 * §7: the boundary IS the upsell surface, and the disabled control at the point of intent
 * is the *entire* mechanism — never a modal, a banner or a nag. Ticket 011 §4 ruled the
 * upsell pull-based precisely because this moment does not have to be manufactured.
 */
export interface LockedControl {
  action:
    | "add-page"
    | "remove-page"
    | "add-section"
    | "remove-section"
    | "move-section"
    | "change-type"
    | "edit-link"
    | "edit-nav"
    | "edit-tokens"
    | "change-option";
  label: string;
  /** Ticket 006's standing links: $100 minor, $300 major. */
  klass: "minor" | "major";
  priceCents: number;
  /** The path the request is about, so the change ticket names the thing. */
  target: string;
}

export interface InventoryGroup {
  id: string;
  label: string;
  kind: "site" | "section";
  /** Section groups only — carried for the preview's scroll-to, never for pricing. */
  sectionType?: string;
  fields: InventoryField[];
  lists: InventoryList[];
  locked: LockedControl[];
}

export interface InventoryPage {
  id: string;
  slug: string;
  label: string;
  groups: InventoryGroup[];
  locked: LockedControl[];
}

export interface FieldInventory {
  /** Which reader produced this. The editor UI branches on it for the preview only. */
  kind: "spec" | "annotated";
  slug: string;
  /** Site-wide fields — contact details, SEO. Rendered above the page list. */
  site: InventoryGroup;
  pages: InventoryPage[];
  locked: LockedControl[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Prices
 *
 * From `productized-tier-scope.md` §7 as amended by specification §1.4: section reorder is
 * major-only (the minor row is deleted), and list item add/remove is free and therefore
 * absent from this table entirely.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CHANGE_PRICE_CENTS = { minor: 10_000, major: 30_000 } as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Paths
 *
 * `a.b[0].c` — the only syntax. Written out rather than pulled in as a dependency
 * because the grammar is two productions and the alternative packages all bring a
 * `set`-by-string that will happily create the intermediate objects a partition exists
 * to forbid.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PathToken = string | number;

export function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  const pattern = /[^.[\]]+|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    tokens.push(match[1] !== undefined ? Number(match[1]) : match[0]);
  }
  return tokens;
}

export function formatPath(tokens: PathToken[]): string {
  return tokens.reduce<string>(
    (acc, t) =>
      typeof t === "number" ? `${acc}[${t}]` : acc === "" ? String(t) : `${acc}.${t}`,
    "",
  );
}

export function getAtPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const token of parsePath(path)) {
    if (node === null || node === undefined) return undefined;
    node = (node as Record<PathToken, unknown>)[token];
  }
  return node;
}

/**
 * Writes only into containers that already exist. A path whose parent is missing is a
 * partition violation dressed as a typo, and creating the parent would let the editor
 * invent structure — which is the one thing the free tier may not do.
 */
export function setAtPath(root: unknown, path: string, value: unknown): void {
  const tokens = parsePath(path);
  const last = tokens.pop();
  if (last === undefined) throw new Error("Empty path");

  let node: unknown = root;
  for (const token of tokens) {
    node = (node as Record<PathToken, unknown> | undefined)?.[token];
    if (node === null || node === undefined) {
      throw new Error(`No container at "${path}" — refusing to create one`);
    }
  }
  (node as Record<PathToken, unknown>)[last] = value;
}
