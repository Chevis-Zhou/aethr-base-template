import { z } from "zod/v4";
import { SECTION_PROP_SCHEMAS, type SectionType } from "../assembly/section-props";
import { siteSpecSchema, type SiteSpec } from "../assembly/site-spec";
import { ICON_MAP } from "../../components/sections/icon-map";
import {
  CHANGE_PRICE_CENTS,
  formatPath,
  getAtPath,
  parsePath,
  type FieldConstraints,
  type FieldInventory,
  type FieldKind,
  type InventoryField,
  type InventoryGroup,
  type InventoryList,
  type InventoryPage,
  type LockedControl,
} from "./inventory";

/**
 * Reader #1 — the `SiteSpec` partition, from ticket 012 §1.
 *
 * The partition is DATA, derived by walking the Zod prop schemas rather than restated as a
 * second list beside them. That is the whole reason this file is short: a fifteenth section
 * type ships its editable fields the moment its schema exists, and a renamed prop cannot
 * leave a stale row here pointing at a path that no longer exists.
 *
 * The classification rules below are the entire free/paid line. There is no policy document
 * behind them — 003 ruling 3 asked for a boundary enforced by what the tool *can do*, and
 * this is it: `buildInventory` emits the free half, and `isFreePath` is the same rule as a
 * predicate so the write path can enforce it server-side without trusting the UI.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * The rules
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A URL has a *correct* value rather than a preferred one, and editing it is the ordinary
 * way a CTA silently dies. Matched on the leaf name, so a new section type inherits the
 * boundary by naming its props the way the existing fourteen do.
 *
 * `client.bookingUrl` and `client.social.*` are deliberately NOT here: §1.1 puts them in
 * the free column because they are contact details the client owns and changes, not
 * navigation the site's structure depends on.
 */
const LINK_LEAVES = new Set(["ctaHref", "href", "link"]);

/** Arrays of `{ label, href }` — navigation wearing a section's clothes. Paid whole. */
const LINK_ARRAYS = new Set(["navLinks", "links"]);

/** The image leaves. Named rather than sniffed: `logo` is an image, `icon` is a picker. */
const IMAGE_LEAVES = new Set([
  "backgroundImage",
  "founderImage",
  "image",
  "avatar",
  "logo",
  "defaultImage",
]);

/**
 * The sibling text field each image renders as its `alt`. Specification §1.3 requires a
 * non-empty alt before an upload saves; no image leaf carries its own, so the constraint
 * lands on the field the component actually reads. Absent = renders no `<img>`.
 */
const ALT_SIBLING: Record<string, string> = {
  founderImage: "founderName",
  image: "title",
  avatar: "author",
  logo: "name",
};

/**
 * Prose long enough to want structure inside it — the two fields ticket 012's amendment §C
 * bought Tiptap for.
 *
 * Kept a *closed set of two* rather than "anything long": a rich-text control on
 * `hero.subheadline` invites a client to bold half a headline the design sized as one
 * weight. Rich text is for the fields that are already paragraphs.
 */
export const RICHTEXT_LEAVES: ReadonlySet<string> = new Set(["story", "answer"]);

/** Fields long enough that a single-line control is the wrong shape. */
const MULTILINE_LEAVES = new Set([
  "mission",
  "description",
  "body",
  "quote",
  "subheading",
  "subheadline",
  "note",
  "detail",
  "tagline",
]);

/**
 * Client-facing names for the section groups.
 *
 * The type name is an implementation detail — deriving the label from it gives a client
 * "Faq" and "Cta band", which reads like the inside of the machine. Only the types whose
 * derived label is wrong are listed; the rest fall through to `labelFor`.
 */
const SECTION_LABELS: Partial<Record<SectionType, string>> = {
  faq: "Questions and answers",
  "cta-band": "Closing call to action",
  "feature-list": "What you offer",
};

/**
 * What a locked control says. The client reads these at the point of intent (§7), so they
 * name the *thing* rather than the prop: "Cta href" is the inside of the machine.
 */
const LOCKED_LABELS: Record<string, string> = {
  ctaHref: "Change where this button goes",
  href: "Change where this link goes",
  link: "Change where this link goes",
  navLinks: "Change the footer links",
  links: "Change these links",
  showForm: "Show or hide the contact form",
  variant: "Change this section's colour",
  featured: "Highlight a different price",
};

/** Plural heading and singular noun for each editable list, keyed on the array's name. */
const LIST_LABELS: Record<string, { plural: string; singular: string }> = {
  services: { plural: "Services", singular: "service" },
  projects: { plural: "Projects", singular: "project" },
  testimonials: { plural: "Testimonials", singular: "testimonial" },
  items: { plural: "Questions", singular: "question" },
  stats: { plural: "Numbers", singular: "number" },
  tiers: { plural: "Prices", singular: "price" },
  features: { plural: "Features", singular: "feature" },
  credentials: { plural: "Credentials", singular: "credential" },
  tags: { plural: "Tags", singular: "tag" },
};

const ICON_NAMES = Object.keys(ICON_MAP);

/* ────────────────────────────────────────────────────────────────────────────
 * Zod introspection
 *
 * Three shapes are all this needs: object → shape, array → element, optional → inner.
 * Everything else in the prop schemas is a string leaf, a boolean or an enum, and the last
 * two are paid (§1.1 puts `contact.showForm` and `cta-band.variant` outside the tool).
 * ──────────────────────────────────────────────────────────────────────────── */

type AnySchema = z.ZodType & {
  shape?: Record<string, AnySchema>;
  element?: AnySchema;
  unwrap?: () => AnySchema;
};

function typeOf(schema: AnySchema): string {
  return (schema as unknown as { _zod: { def: { type: string } } })._zod.def.type;
}

/** Strips `optional` / `default` / `nullable` wrappers and reports whether it found one. */
function unwrap(schema: AnySchema): { inner: AnySchema; required: boolean } {
  let inner = schema;
  let required = true;
  while (
    typeof inner.unwrap === "function" &&
    ["optional", "default", "nullable"].includes(typeOf(inner))
  ) {
    required = false;
    inner = inner.unwrap();
  }
  return { inner, required };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Classification
 * ──────────────────────────────────────────────────────────────────────────── */

function leafKind(name: string): FieldKind | null {
  if (LINK_LEAVES.has(name)) return null;
  if (IMAGE_LEAVES.has(name)) return "image";
  if (name === "icon") return "icon";
  if (RICHTEXT_LEAVES.has(name)) return "richtext";
  if (MULTILINE_LEAVES.has(name)) return "textarea";
  return "text";
}

function lockedLabel(name: string): string {
  return LOCKED_LABELS[name] ?? `Change ${labelFor(name).toLowerCase()}`;
}

function labelFor(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The partition as a predicate — the server-side half of the boundary.
 *
 * The editor renders only free paths, but a POST is a POST: the API validates every path
 * against this before touching the draft, so the boundary survives a hand-rolled request.
 * Kept in the same file as the builder deliberately — one rule, two callers, no drift.
 */
export function isFreePath(path: string): boolean {
  const tokens = parsePath(path);
  if (tokens.length === 0) return false;
  const names = tokens.filter((t): t is string => typeof t === "string");
  const leaf = names[names.length - 1];

  // Any link target, at any depth, and any member of a link array.
  if (LINK_LEAVES.has(leaf)) return false;
  if (names.some((n) => LINK_ARRAYS.has(n))) return false;

  switch (tokens[0]) {
    case "client":
      // Contact details the client owns, `social.*` included. `bookingUrl` is caught above.
      return names.length <= 3 && leaf !== "social";
    case "seo":
      return ["siteName", "defaultImage", "keywords"].includes(leaf);
    case "pages": {
      // `pages[i].title` / `.description` are free; membership, order and slug are not.
      if (tokens.length === 3 && (leaf === "title" || leaf === "description")) return true;
      // Everything else must sit under `pages[i].sections[j].props`.
      const propsAt = tokens.indexOf("props");
      if (propsAt !== 4 || tokens.length <= 5) return false;
      // `type`, section order and section membership never reach here — the path would
      // stop at `sections[j]` and fail the check above.
      return leafKind(leaf) !== null;
    }
    default:
      // `tokens.*` and `nav[]` land here, and stay paid.
      return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Building the inventory
 * ──────────────────────────────────────────────────────────────────────────── */

function major(action: LockedControl["action"], label: string, target: string): LockedControl {
  return { action, label, klass: "major", priceCents: CHANGE_PRICE_CENTS.major, target };
}

function minor(action: LockedControl["action"], label: string, target: string): LockedControl {
  return { action, label, klass: "minor", priceCents: CHANGE_PRICE_CENTS.minor, target };
}

/** Walks one object schema, emitting the free leaves and the editable lists beneath it. */
function walkObject(
  schema: AnySchema,
  basePath: string,
  value: unknown,
  out: { fields: InventoryField[]; lists: InventoryList[]; locked: LockedControl[] },
  inList = false,
): void {
  const shape = schema.shape ?? {};

  for (const [name, raw] of Object.entries(shape)) {
    const { inner, required } = unwrap(raw);
    const path = `${basePath}.${name}`;
    const kind = typeOf(inner);

    if (kind === "object") {
      if (LINK_ARRAYS.has(name)) {
        out.locked.push(major("edit-link", lockedLabel(name), path));
        continue;
      }
      walkObject(inner, path, getAtPath(value, name), out);
      continue;
    }

    if (kind === "array") {
      if (LINK_ARRAYS.has(name)) {
        out.locked.push(major("edit-link", lockedLabel(name), path));
        continue;
      }
      const element = unwrap(inner.element as AnySchema).inner;
      const items = (getAtPath(value, name) as unknown[]) ?? [];

      if (typeOf(element) === "object") {
        const listLabel = LIST_LABELS[name];
        out.lists.push({
          id: path,
          label: listLabel?.plural ?? labelFor(name),
          itemLabel: listLabel?.singular ?? "item",
          count: items.length,
          min: 1,
          template: blankItem(element),
        });
        items.forEach((item, index) => {
          walkObject(element, `${path}[${index}]`, item, out, true);
        });
      } else if (typeOf(element) === "string") {
        // `projects[].tags`, `tiers[].includes`, `seo.keywords` — edited as one control,
        // one entry per line. Newline rather than comma because a pricing bullet
        // legitimately contains commas and a comma-joined control would eat them.
        out.fields.push({
          id: path,
          kind: "string-list",
          label: labelFor(name),
          value: (items as string[]).join("\n"),
          constraints: { required },
        });
      }
      continue;
    }

    if (kind === "boolean" || kind === "enum") {
      // §1.1 puts these outside the tool. They are content inside existing structure the
      // editor cannot reach, which is exactly the $100 minor class.
      //
      // Not surfaced per list item: a `featured` flag on the third pricing tier is not
      // something a client reaches for by name, and one disabled control per item turns
      // §7's point-of-intent boundary into the nag it explicitly forbids. Invisible is
      // still outside the tool, which is the only property the partition needs.
      if (!inList) {
        out.locked.push(minor("change-option", lockedLabel(name), path));
      }
      continue;
    }

    if (kind !== "string") continue;

    const fieldKind = leafKind(name);
    if (fieldKind === null) {
      out.locked.push(major("edit-link", lockedLabel(name), path));
      continue;
    }

    const constraints: FieldConstraints = { required };
    if (fieldKind === "icon") constraints.options = ICON_NAMES;
    const sibling = ALT_SIBLING[name];
    if (fieldKind === "image" && sibling) {
      constraints.altPath = `${basePath}.${sibling}`;
    }

    out.fields.push({
      id: path,
      kind: fieldKind,
      label: labelFor(name),
      value: String(getAtPath(value, name) ?? ""),
      constraints,
    });
  }
}

/** A new list item that still parses: every required string leaf present and empty. */
function blankItem(element: AnySchema): Record<string, string> {
  const item: Record<string, string> = {};
  for (const [name, raw] of Object.entries(element.shape ?? {})) {
    const { inner, required } = unwrap(raw);
    if (required && typeOf(inner) === "string") item[name] = "";
  }
  return item;
}

function emptyGroup(id: string, label: string, kind: InventoryGroup["kind"]): InventoryGroup {
  return { id, label, kind, fields: [], lists: [], locked: [] };
}

export function buildInventory(spec: SiteSpec, slug: string): FieldInventory {
  const site = emptyGroup("site", "Your details", "site");

  // `client` and `seo` are the site-wide half of §1.1's free column. Walked through the
  // same code as a section's props so their link leaves are caught by the same rule.
  walkObject(
    (siteSpecSchema as unknown as AnySchema & { shape: Record<string, AnySchema> }).shape
      .client as AnySchema,
    "client",
    spec.client,
    site,
  );
  walkObject(
    unwrap(
      (siteSpecSchema as unknown as AnySchema & { shape: Record<string, AnySchema> }).shape
        .seo as AnySchema,
    ).inner,
    "seo",
    spec.seo,
    site,
  );

  const pages: InventoryPage[] = spec.pages.map((page, pageIndex) => {
    const pagePath = `pages[${pageIndex}]`;
    const groups: InventoryGroup[] = page.sections.map((section, sectionIndex) => {
      const sectionPath = `${pagePath}.sections[${sectionIndex}]`;
      const type = section.type as SectionType;
      const group = emptyGroup(sectionPath, SECTION_LABELS[type] ?? labelFor(type), "section");
      group.sectionType = type;

      walkObject(
        SECTION_PROP_SCHEMAS[type] as unknown as AnySchema,
        `${sectionPath}.props`,
        section.props,
        group,
      );

      // §7 — the boundary as the upsell surface. Visible, disabled, priced, at the point
      // of intent. Never a modal, never a banner.
      group.locked.push(
        major("move-section", "Move this section", sectionPath),
        major("remove-section", "Remove this section", sectionPath),
        major("change-type", "Swap this section for another kind", sectionPath),
      );
      return group;
    });

    return {
      id: pagePath,
      slug: page.slug,
      label: page.title,
      groups,
      locked: [major("add-section", "Add a section to this page", pagePath)],
    };
  });

  return {
    kind: "spec",
    slug,
    site,
    pages,
    locked: [
      major("add-page", "Add a page", "pages"),
      major("remove-page", "Remove a page", "pages"),
      major("edit-nav", "Change the navigation", "nav"),
      major("edit-tokens", "Change colours, fonts or corners", "tokens"),
    ],
  };
}

/** Convenience for callers holding raw JSON — validates, then builds. */
export function inventoryFromJson(raw: unknown, slug: string): FieldInventory {
  const result = z.safeParse(siteSpecSchema, raw);
  if (!result.success) {
    throw new Error(`Spec validation failed:\n${z.prettifyError(result.error)}`);
  }
  return buildInventory(result.data, slug);
}

export { formatPath };
