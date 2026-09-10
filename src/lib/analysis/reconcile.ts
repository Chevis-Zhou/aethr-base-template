import type { SiteSpec } from "../assembly/site-spec";
import type { SectionType } from "../assembly/section-props";
import { RAIL_PROP_PATHS, type RailField } from "./rail";
import type { IntakeRecord } from "./intake";
import type { StructureResult } from "./structure";

/**
 * Post-generation reconciliation — deterministic, and the reason the verbatim rail is code
 * rather than prompt advice.
 *
 * 007's governing ruling is that rail text is the client's own words and is never
 * rephrased. A prompt can ask for that; only an overwrite guarantees it. Runs in a fixed
 * order: strip `_flags`, overwrite the rail, overwrite CTA hrefs. The numbers rule is the
 * linter's job (rule 1), not this file's.
 */

export type ReconcileFlagReason =
  | "unmapped-content"
  | "rail-item-not-in-intake"
  | "rail-item-omitted"
  | "cta-href-overwritten";

export interface ReconcileFlag {
  reason: ReconcileFlagReason;
  field?: RailField;
  /** Verbatim, always — 008 §6 requires unmapped content reach REVIEW unsummarised. */
  detail: string;
}

export interface ReconcileResult {
  spec: SiteSpec;
  flags: ReconcileFlag[];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Normalise for comparison only — never for output. Collapses whitespace, unifies the
 * quote and dash characters a model routinely substitutes, lowercases.
 */
function normalise(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalise(s).split(/[^a-z0-9]+/).filter(Boolean));
}

/** Jaccard overlap. 0.8 is the plan's threshold for "this is the same item, paraphrased". */
function overlap(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

const MATCH_THRESHOLD = 0.8;

/**
 * Match one drafted item to the intake item it is trying to be. Exact on the normalised
 * form, else best token-set overlap above the threshold.
 */
function matchIndex(drafted: string, candidates: string[], used: Set<number>): number | null {
  const target = normalise(drafted);

  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    if (normalise(candidates[i]) === target) return i;
  }

  let best: number | null = null;
  let bestScore = MATCH_THRESHOLD;
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const score = overlap(drafted, candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rail overwrite
// ---------------------------------------------------------------------------

type Rail = Record<string, unknown>;

function sectionsOfType(spec: SiteSpec, type: SectionType): Rail[] {
  const out: Rail[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.type === type) out.push(section.props as Rail);
    }
  }
  return out;
}

/**
 * Overwrite an array-shaped rail prop.
 *
 * Three outcomes per item, and the asymmetry is deliberate: a drafted item that matches an
 * intake item is **replaced verbatim**; a drafted item that matches nothing is **removed
 * and flagged** (the model invented it); an intake item the model left out is **not
 * re-inserted** — omission is on ruling 10's open list — but is listed so REVIEW sees what
 * was dropped.
 */
function overwriteArray<T>(
  spec: SiteSpec,
  section: SectionType,
  prop: string,
  intakeItems: T[],
  /**
   * The two sides of the comparison, built the same way so they are comparable. Matching
   * the drafted item's props one at a time against a concatenated intake identity does not
   * work — a drafted stat `{value: "12", label: "Topics"}` scores 0.5 against `"12 Topics"`
   * on either prop alone and is discarded as invented.
   */
  identity: { intake: (item: T) => string; draft: (item: Rail) => string },
  /** Write the intake item's fields over the drafted object. */
  write: (target: Rail, item: T) => void,
  field: RailField,
  flags: ReconcileFlag[],
): void {
  const used = new Set<number>();
  const candidates = intakeItems.map(identity.intake);

  for (const props of sectionsOfType(spec, section)) {
    const drafted = props[prop];
    if (!Array.isArray(drafted)) continue;

    const kept: Rail[] = [];
    for (const item of drafted as Rail[]) {
      const draftedText = identity.draft(item);
      const best = matchIndex(draftedText, candidates, used);
      if (best === null) {
        flags.push({
          reason: "rail-item-not-in-intake",
          field,
          detail: draftedText,
        });
        continue;
      }
      used.add(best);
      write(item, intakeItems[best]);
      kept.push(item);
    }
    props[prop] = kept;
  }

  intakeItems.forEach((item, i) => {
    if (used.has(i)) return;
    flags.push({
      reason: "rail-item-omitted",
      field,
      detail: identity.intake(item),
    });
  });
}

/** Read a string prop off a drafted item, for building its identity text. */
function str(item: Rail, key: string): string {
  const v = item[key];
  return typeof v === "string" ? v : "";
}

function overwriteScalar(
  spec: SiteSpec,
  section: SectionType,
  prop: string,
  value: string,
): void {
  for (const props of sectionsOfType(spec, section)) {
    if (!value) delete props[prop];
    else props[prop] = value;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/** A generated draft, before validation: a SiteSpec plus the model's `_flags`. */
export type Draft = SiteSpec & { _flags?: { unmapped?: unknown } };

export function reconcile(
  draft: Draft,
  intake: IntakeRecord,
  structure: StructureResult,
): ReconcileResult {
  const flags: ReconcileFlag[] = [];
  const spec: Draft = JSON.parse(JSON.stringify(draft));

  // (a) Strip `_flags` — unmapped content, verbatim, out of the spec entirely. 004 §8
  // item 2 ruled against a thirteenth `unmapped` section type: a spec is the thing that
  // builds, and unmapped content by definition does not.
  const unmapped = spec._flags?.unmapped;
  if (Array.isArray(unmapped)) {
    for (const item of unmapped) {
      flags.push({ reason: "unmapped-content", detail: String(item) });
    }
  }
  delete spec._flags;

  // (b) Rail overwrite, in `RAIL_PROP_PATHS` order.
  overwriteArray(
    spec,
    "feature-list",
    "features",
    intake.B4,
    { intake: (line) => line, draft: (d) => str(d, "title") },
    (target, line) => {
      target.title = line;
    },
    "B4",
    flags,
  );

  overwriteScalar(spec, "about", "pullQuote", intake.B5);

  overwriteArray(
    spec,
    "stats",
    "stats",
    intake.D1,
    {
      intake: (row) => `${row.value} ${row.label}`,
      draft: (d) => `${str(d, "value")} ${str(d, "label")}`.trim(),
    },
    (target, row) => {
      target.value = row.value;
      target.label = row.label;
    },
    "D1",
    flags,
  );

  overwriteArray(
    spec,
    "credentials",
    "credentials",
    intake.D2,
    { intake: (line) => line, draft: (d) => str(d, "name") },
    (target, line) => {
      target.name = line;
    },
    "D2",
    flags,
  );

  overwriteArray(
    spec,
    "testimonials",
    "testimonials",
    intake.D3,
    { intake: (t) => t.quote, draft: (d) => str(d, "quote") },
    (target, t) => {
      // D3's `name` is `author` in the spec — the two schemas spell it differently.
      target.quote = t.quote;
      target.author = t.name;
      if (t.role) target.role = t.role;
      else delete target.role;
    },
    "D3",
    flags,
  );

  overwriteArray(
    spec,
    "services",
    "services",
    intake.C2,
    { intake: (label) => label, draft: (d) => str(d, "title") },
    (target, label) => {
      target.title = label;
    },
    "C2",
    flags,
  );

  overwriteArray(
    spec,
    "pricing",
    "tiers",
    intake.C4,
    {
      intake: (row) => `${row.label} ${row.price}`,
      draft: (d) => `${str(d, "name")} ${str(d, "price")}`.trim(),
    },
    (target, row) => {
      target.name = row.label;
      target.price = row.price;
    },
    "C4",
    flags,
  );

  overwriteScalar(spec, "pricing", "note", intake.C6);

  // (c) CTA hrefs. Targets are closed (ruling 10); labels are prose and stay untouched.
  const href = structure.cta.href;
  if (href !== null) {
    for (const type of ["hero", "cta-band"] as const) {
      for (const props of sectionsOfType(spec, type)) {
        if (props.ctaHref !== href) {
          flags.push({
            reason: "cta-href-overwritten",
            detail: `${type}.ctaHref: "${String(props.ctaHref)}" → "${href}"`,
          });
        }
        props.ctaHref = href;
      }
    }
    for (const props of sectionsOfType(spec, "pricing")) {
      const tiers = props.tiers;
      if (!Array.isArray(tiers)) continue;
      for (const tier of tiers as Rail[]) {
        if (tier.ctaHref !== undefined) tier.ctaHref = href;
      }
    }
  }

  return { spec: spec as SiteSpec, flags };
}

/** Which prop paths the rail owns — re-exported so the flags sheet can cite them. */
export { RAIL_PROP_PATHS };
