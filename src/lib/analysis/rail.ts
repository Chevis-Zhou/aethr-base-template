import type { SiteSpec } from "../assembly/site-spec";
import type { SectionType } from "../assembly/section-props";

/**
 * The verbatim rail, as a prop map — and the function that scopes the copy linter.
 *
 * `productized-voice.md` §2 names eight intake fields whose text is the client's own words
 * and is never rephrased. This file says exactly where each of them lands in a `SiteSpec`,
 * which is what lets Phase 2 overwrite those props mechanically after generation instead
 * of asking the prompt nicely. §7 of the same doc exempts rail fields from every linter
 * rule, so the same map also defines the linter's scope by subtraction.
 */

/** The eight rail fields of `productized-voice.md` §2. */
export type RailField = "B4" | "B5" | "D1" | "D2" | "D3" | "C2" | "C4" | "C6";

/**
 * A canonical prop path: `<sectionType>.<propPath>`, with `[]` standing in for any array
 * index. `feature-list.features[].title` addresses the title of every feature in every
 * `feature-list` section on the site.
 */
export type CanonicalPath = string;

/**
 * Where each rail field's text lands. Phase 2 overwrites exactly these paths from the
 * intake record after generation; anything the model wrote there is discarded, and any
 * item it could not place is dropped and flagged.
 */
export const RAIL_PROP_PATHS: Record<RailField, CanonicalPath[]> = {
  /** What makes you different — the differentiator lines. */
  B4: ["feature-list.features[].title"],
  /** The one line a visitor should remember. */
  B5: ["about.pullQuote"],
  /** Numbers you can stand behind. The only permitted source of any number on the site. */
  D1: ["stats.stats[].value", "stats.stats[].label"],
  /** Credentials, awards, affiliations. */
  D2: ["credentials.credentials[].name"],
  /** Testimonials. D3's `name` lands on `author` — the two schemas spell it differently. */
  D3: [
    "testimonials.testimonials[].quote",
    "testimonials.testimonials[].author",
    "testimonials.testimonials[].role",
  ],
  /** Service or topic labels. */
  C2: ["services.services[].title"],
  /** Price rows. */
  C4: ["pricing.tiers[].name", "pricing.tiers[].price"],
  /** Payment or booking note. */
  C6: ["pricing.note"],
};

const RAIL_PATHS = new Set<CanonicalPath>(Object.values(RAIL_PROP_PATHS).flat());

/**
 * Client-supplied text that is not on the rail but is not generated either.
 *
 * The rail is a *voice* rule — "the client's own words, never rephrased". These paths are
 * something narrower: identity and contact details copied straight out of Group A, plus
 * `disclosure.body`, which MAP rules is client-supplied verbatim with adequacy left to the
 * client's counsel. Linting them produces only false positives — rule 3 would fire on a
 * business legitimately named "Premier Roofing" — so they are outside the linter's scope
 * for the same reason the rail is, by a different route.
 */
export const PASSTHROUGH_PROP_PATHS: CanonicalPath[] = [
  "contact.email",
  "contact.phone",
  "contact.address",
  "footer.companyName",
  "footer.copyright",
  // C5 — "work to show (title + one line + image)". The client typed these. C5 is not on
  // §2's rail, but it is not generated either, and linting it fires rule 3 on a project
  // legitimately called "Premier Plaza".
  "portfolio.projects[].title",
  "portfolio.projects[].description",
  // Regulatory fine print, client-supplied verbatim, adequacy left to their counsel (MAP).
  "disclosure.body",
];

const PASSTHROUGH_PATHS = new Set<CanonicalPath>(PASSTHROUGH_PROP_PATHS);

/**
 * Canonical prefixes that are machine values throughout. `socialLinks` holds four URLs
 * under prop names ("linkedin", "twitter") that no last-segment rule would catch.
 */
const NON_PROSE_PREFIXES = ["footer.socialLinks."];

/** Top-level (non-section) spec paths that are identity or machine values, never prose. */
const NON_PROSE_TOP_LEVEL = new Set<string>([
  "client.name",
  "client.email",
  "client.phone",
  "client.address",
  "client.bookingUrl",
  "seo.siteName",
  "seo.defaultImage",
]);

/**
 * Prop names that hold a machine value rather than copy — links, asset references and the
 * two rendering enums. Matched on the last path segment.
 */
const NON_PROSE_PROP_NAMES = new Set<string>([
  "href",
  "ctaHref",
  "link",
  "logo",
  "icon",
  "image",
  "avatar",
  "founderImage",
  "backgroundImage",
  "variant",
  "slug",
]);

/**
 * True when a canonical path carries content the client supplied — rail or passthrough.
 * The copy floor uses this to decide what a section or an array item would still be worth
 * rendering if its generated copy were removed.
 */
export function isClientSuppliedPath(path: CanonicalPath): boolean {
  return (
    RAIL_PATHS.has(path) ||
    PASSTHROUGH_PATHS.has(path) ||
    NON_PROSE_PREFIXES.some((p) => path.startsWith(p))
  );
}

/** True when a canonical path carries a client's own words and generation may not touch it. */
export function isRailPath(path: CanonicalPath): boolean {
  return RAIL_PATHS.has(path);
}

/** Which rail field owns a path, or null. Used by the flags sheet to trace a value home. */
export function railFieldFor(path: CanonicalPath): RailField | null {
  for (const [field, paths] of Object.entries(RAIL_PROP_PATHS)) {
    if (paths.includes(path)) return field as RailField;
  }
  return null;
}

export interface StringPath {
  /** The concrete address in the spec, array indices included. */
  path: string;
  /** The same address with indices collapsed to `[]`, for rail and scope lookups. */
  canonical: CanonicalPath;
  value: string;
}

function canonicalise(sectionType: SectionType, propPath: string): CanonicalPath {
  return `${sectionType}.${propPath.replace(/\[\d+\]/g, "[]")}`;
}

function lastSegment(propPath: string): string {
  const parts = propPath.split(".");
  return parts[parts.length - 1] ?? propPath;
}

/**
 * Every string-valued prop in a spec, split into the three categories the copy floor cares
 * about. `generated` is the linter's scope: string props that are neither rail nor
 * passthrough nor a machine value.
 */
export function classifyStringPaths(spec: SiteSpec): {
  generated: StringPath[];
  rail: StringPath[];
  passthrough: StringPath[];
} {
  const generated: StringPath[] = [];
  const rail: StringPath[] = [];
  const passthrough: StringPath[] = [];

  const walk = (
    node: unknown,
    propPath: string,
    concretePath: string,
    sectionType: SectionType,
  ): void => {
    if (typeof node === "string") {
      const canonical = canonicalise(sectionType, propPath);
      const entry: StringPath = { path: concretePath, canonical, value: node };

      if (RAIL_PATHS.has(canonical)) rail.push(entry);
      else if (PASSTHROUGH_PATHS.has(canonical)) passthrough.push(entry);
      else if (NON_PROSE_PREFIXES.some((p) => canonical.startsWith(p))) passthrough.push(entry);
      else if (!NON_PROSE_PROP_NAMES.has(lastSegment(propPath))) generated.push(entry);
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, i) =>
        walk(item, `${propPath}[${i}]`, `${concretePath}[${i}]`, sectionType),
      );
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const nextProp = propPath ? `${propPath}.${key}` : key;
        walk(value, nextProp, `${concretePath}.${key}`, sectionType);
      }
    }
  };

  spec.pages.forEach((page, pageIndex) => {
    const base = `pages[${pageIndex}]`;
    // Page titles and descriptions are generated copy — they carry the same claims a
    // heading does, and a fabricated number in a meta description ships to search results.
    generated.push({
      path: `${base}.title`,
      canonical: "page.title",
      value: page.title,
    });
    if (page.description) {
      generated.push({
        path: `${base}.description`,
        canonical: "page.description",
        value: page.description,
      });
    }

    page.sections.forEach((section, sectionIndex) => {
      walk(
        section.props,
        "",
        `${base}.sections[${sectionIndex}].props`,
        section.type as SectionType,
      );
    });
  });

  // Top-level generated copy: the tagline and the meta description (`productized-voice.md`
  // §3), plus SEO keywords. `client.name` and friends are identity, not prose.
  for (const [key, value] of Object.entries(spec.client)) {
    const path = `client.${key}`;
    if (typeof value !== "string") continue;
    if (NON_PROSE_TOP_LEVEL.has(path)) passthrough.push({ path, canonical: path, value });
    else generated.push({ path, canonical: path, value });
  }

  spec.seo.keywords?.forEach((keyword, i) => {
    generated.push({ path: `seo.keywords[${i}]`, canonical: "seo.keywords[]", value: keyword });
  });

  return { generated, rail, passthrough };
}

/** The linter's scope: every generated string prop in a spec. Phase 2 consumes this. */
export function generatedStringPaths(spec: SiteSpec): StringPath[] {
  return classifyStringPaths(spec).generated;
}
