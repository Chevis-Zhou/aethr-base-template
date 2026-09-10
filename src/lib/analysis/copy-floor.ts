import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SECTION_PROP_SCHEMAS, type SectionType } from "../assembly/section-props";
import type { SiteSpec } from "../assembly/site-spec";
import {
  classifyStringPaths,
  generatedStringPaths,
  isClientSuppliedPath,
  type StringPath,
} from "./rail";
import type { IntakeRecord } from "./intake";

/**
 * The copy floor — `productized-voice.md` §7's eight rules, as code.
 *
 * A TS port of the working prototype at `tasteled/assets/prototype/copy-linter.mjs`, with
 * two changes and no third: it walks a `SiteSpec` through `generatedStringPaths()` instead
 * of a flat `{path: text}` map, and it carries the omission rule 008 §10 added. Rule
 * semantics, morphology and stopwords are the prototype's, unchanged — including rule 2's
 * over-trigger, which fails closed and is left alone deliberately.
 *
 * **Scope is generated fields only.** Rail and passthrough paths never reach here; §7 is
 * explicit that running these rules over a client's own words would corrupt their evidence.
 *
 * **Failures are never fed back to the model.** 008 §10: feeding a linter violation back
 * trains it to reword until it evades the check, which is strictly worse than a blank.
 */

const WORDS_FILE = join(__dirname, "words.txt");

const SUPERLATIVES = [
  "best",
  "leading",
  "premier",
  "top-rated",
  "award-winning",
  "#1",
  "world-class",
  "cutting-edge",
  "unmatched",
  "trusted",
];

const VOCAB = [
  "unlock",
  "leverage",
  "robust",
  "seamless",
  "holistic",
  "streamline",
  "elevate",
  "empower",
  "showcase",
  "facilitate",
  "nurture",
  "comprehensive",
  "in order to",
  "it's worth noting",
  "in conclusion",
];

/** Exported so `assert.ts` can re-run rule 5 rather than trust the report. */
export const PLACEHOLDERS = ["lorem", "tbd", "xx", "[", "{{"];

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
};

/** Words that look like proper nouns but are sentence-initial or grammatical. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "he", "she", "they", "his", "her", "their", "it", "its", "this", "that", "these",
  "those", "one", "send", "ready", "private", "simple", "how", "what", "why", "who",
  "where", "when", "get", "start", "meet", "max", "topics", "rates", "contact",
  "available", "availability",
]);

export interface Violation {
  /** Concrete spec path, e.g. `pages[0].sections[0].props.headline`. */
  path: string;
  rule: number;
  detail: string;
}

export interface CopyFloorReport {
  violations: Violation[];
  /** Distinct paths that failed, i.e. the fields that get blanked. */
  failedPaths: string[];
  fieldsChecked: number;
  /** `<sectionType> — <field> failed rule N` for each section dropped by the omission rule. */
  omittedSections: string[];
  /**
   * Sections that lost a schema-required prop but kept their client-supplied content, so
   * they render without it instead of disappearing. The REVIEW sheet reads these first.
   */
  suppressedProps: SuppressedProp[];
  /** Fields a deterministic repair cleared, so they ship as written rather than blank. */
  repairs: Repair[];
  /** Array items dropped because a required prop blanked and the item was wholly generated. */
  prunedItems: PrunedItem[];
}

export interface PrunedItem {
  sectionType: string;
  /** e.g. `items[2]` — the array prop and index that was removed. */
  item: string;
  prop: string;
  rule: number;
}

export interface Repair {
  path: string;
  /** The rule the repair cleared. */
  rule: number;
  before: string;
  after: string;
}

export interface SuppressedProp {
  sectionType: string;
  /** The blanked prop, e.g. `heading`. */
  prop: string;
  rule: number;
  /** Non-empty rail/passthrough strings still in the section — the reason it survived. */
  survivingClientFields: number;
}

/**
 * Thrown when the bundled word list is missing. Rule 6 cannot run without a dictionary
 * discriminator, and running the other seven while silently skipping it would report a
 * clean pass on a spec full of hallucinated proper nouns. The prototype exits 2 here; so
 * does the CLI wrapper.
 */
export class MissingWordListError extends Error {
  readonly exitCode = 2;
  constructor(path: string) {
    super(
      `copy-floor: no word list at ${path}; rule 6 cannot run. The list is bundled ` +
        `deliberately — restore it rather than falling back to the host.`,
    );
    this.name = "MissingWordListError";
  }
}

let dictCache: Set<string> | null = null;

function loadDict(): Set<string> {
  if (dictCache) return dictCache;
  if (!existsSync(WORDS_FILE)) throw new MissingWordListError(WORDS_FILE);

  const dict = new Set<string>();
  for (const line of readFileSync(WORDS_FILE, "utf8").split("\n")) {
    const w = line.trim().toLowerCase();
    if (w && !w.startsWith("#")) dict.add(w);
  }
  if (!dict.size) throw new MissingWordListError(WORDS_FILE);

  dictCache = dict;
  return dict;
}

/**
 * The 1934 list carries lemmas, not inflections. Cheap morphology closes the gap:
 * tutors → tutor, families → family, pricing → price. Prototype's, verbatim.
 */
function isOrdinaryWord(w: string, dict: Set<string>): boolean {
  const candidates = [w];
  if (w.endsWith("s")) candidates.push(w.slice(0, -1));
  if (w.endsWith("es")) candidates.push(w.slice(0, -2));
  if (w.endsWith("ies")) candidates.push(w.slice(0, -3) + "y");
  if (w.endsWith("ing")) candidates.push(w.slice(0, -3), w.slice(0, -3) + "e");
  if (w.endsWith("ed")) candidates.push(w.slice(0, -2), w.slice(0, -1));
  return candidates.some((c) => dict.has(c));
}

/** Exported so `assert.ts` can re-run rule 1 against the allow-list rather than trust the report. */
export function digitsIn(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/**
 * Rule 1's allow-list: the only digits generated copy may contain are the ones the client
 * typed into D1, C4 or G1.
 */
export function allowedNumbers(intake: IntakeRecord): Set<string> {
  const allowed = new Set<string>();
  for (const row of intake.D1) for (const n of digitsIn(String(row.value))) allowed.add(n);
  for (const row of intake.C4) for (const n of digitsIn(String(row.price))) allowed.add(n);
  for (const n of digitsIn(String(intake.G1))) allowed.add(n);
  return allowed;
}

/**
 * Rule 2's tripwire set: the length of anything the spec holds as a list. A meta description
 * saying "12 topics" is correct today and wrong the moment a topic is added — a drift no
 * human proofreader catches, because both numbers are individually plausible.
 */
function listLengths(intake: IntakeRecord): Set<string> {
  return new Set(
    [intake.C2, intake.B4, intake.D1, intake.D2, intake.D3, intake.D4, intake.C4].map((l) =>
      String(l.length),
    ),
  );
}

function checkField(
  entry: StringPath,
  ctx: {
    allowed: Set<string>;
    lengths: Set<string>;
    intakeText: string;
    dict: Set<string>;
    /** Nav-link labels whose href resolves to something in this spec — see `resolvedNavLabels`. */
    resolvedNav: Set<string>;
  },
): Violation[] {
  const out: Violation[] = [];
  const text = entry.value;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const fail = (rule: number, detail: string) => out.push({ path: entry.path, rule, detail });

  // 1 — no digit the client did not type.
  for (const n of digitsIn(text)) {
    if (!ctx.allowed.has(n)) fail(1, `digit "${n}" not present in D1/C4/G1`);
  }

  // 2 — no count claim.
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text) && ctx.lengths.has(String(value))) {
      fail(2, `states a count ("${word}") equal to a spec list length — drifts silently`);
    }
  }
  for (const n of digitsIn(text)) {
    if (ctx.lengths.has(n)) fail(2, `states a count ("${n}") equal to a spec list length`);
  }

  // 3 — no superlatives.
  for (const s of SUPERLATIVES) {
    if (new RegExp(`\\b${s.replace(/[#]/g, "\\#")}\\b`, "i").test(lower)) {
      fail(3, `superlative "${s}"`);
    }
  }

  // 4 — no vocabulary cluster (two or more in one field).
  const hits = VOCAB.filter((v) => lower.includes(v));
  if (hits.length >= 2) fail(4, `vocabulary cluster: ${hits.join(", ")}`);

  // 5 — no placeholder.
  for (const p of PLACEHOLDERS) {
    if (lower.includes(p)) fail(5, `placeholder token "${p}"`);
  }

  // 6 — proper nouns must trace to the intake record, or to this spec's own structure.
  //
  // A nav label is the one generated string whose referent is provably inside the document:
  // `{ label: "FAQ", href: "#faq" }` names a section that either exists in the spec or does
  // not, and the assembler answers that question without consulting the intake. So a label
  // pointing at a real destination has a source, and rule 6 has nothing to catch. Without
  // this, "FAQ" — an acronym in no dictionary and in no intake field — read as a fabricated
  // proper noun and the link to a section on the same page was deleted.
  //
  // Only rule 6 is skipped. A label is still a generated string for every other rule: a
  // fabricated digit or a placeholder in a nav label is caught exactly as before.
  const navResolved = ctx.resolvedNav.has(entry.path);
  for (const w of navResolved ? [] : words) {
    const clean = w.replace(/^[^A-Za-z]+|[^A-Za-z&]+$/g, "");
    if (!/^[A-Z][a-zA-Z]+$/.test(clean)) continue;
    if (STOPWORDS.has(clean.toLowerCase())) continue;
    if (isOrdinaryWord(clean.toLowerCase(), ctx.dict)) continue;
    if (!ctx.intakeText.includes(clean.toLowerCase())) {
      fail(6, `proper noun "${clean}" does not appear in the intake record`);
    }
  }

  // 7 — em dashes.
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes > 1) fail(7, `${dashes} em dashes in one field (max 1)`);
  if (dashes > 0 && words.length < 15) {
    fail(7, `em dash in a ${words.length}-word field (max 0 under 15)`);
  }

  // 8 — no delta without an anchor.
  if (
    /(?:^|\s)[+-]?\d+(?:\.\d+)?%/.test(text) &&
    !/\b(than|vs\.?|versus|compared|against|from)\b/i.test(text)
  ) {
    fail(8, "percentage stated without a comparator");
  }

  return out;
}

/**
 * Paths of `navLinks[].label` strings whose sibling `href` resolves inside this spec — an
 * anchor naming a section type present on the page, or a route matching a page slug. These
 * labels are structural, not claims, so rule 6 does not apply to them.
 */
function resolvedNavLabels(spec: SiteSpec): Set<string> {
  const slugs = new Set(spec.pages.map((p) => p.slug));
  const out = new Set<string>();

  spec.pages.forEach((page, pageIndex) => {
    const anchors = new Set(page.sections.map((sec) => `#${sec.type}`));
    page.sections.forEach((section, i) => {
      const links = (section.props as Record<string, unknown>).navLinks;
      if (!Array.isArray(links)) return;
      links.forEach((link, index) => {
        if (link === null || typeof link !== "object") return;
        const { href } = link as { href?: unknown };
        if (typeof href !== "string") return;
        if (!anchors.has(href) && !slugs.has(href)) return;
        out.add(`pages[${pageIndex}].sections[${i}].props.navLinks[${index}].label`);
      });
    });
  });
  return out;
}

/** Lint a spec's generated fields without modifying it. */
export function lintSpec(spec: SiteSpec, intake: IntakeRecord): Violation[] {
  const ctx = {
    allowed: allowedNumbers(intake),
    lengths: listLengths(intake),
    intakeText: JSON.stringify(intake).toLowerCase(),
    dict: loadDict(),
    resolvedNav: resolvedNavLabels(spec),
  };
  return generatedStringPaths(spec).flatMap((entry) => checkField(entry, ctx));
}

// ---------------------------------------------------------------------------
// Repair — the violations a machine can fix without inventing anything
// ---------------------------------------------------------------------------

/**
 * Rule 7 is the only one of the eight with a deterministic repair, and the reason is worth
 * stating because it is the line this pass must not cross.
 *
 * Rules 1, 2, 3, 5, 6 and 8 fail on **claims**: a digit the client never typed, a count that
 * will drift, a superlative, a placeholder, a proper noun with no source, a delta with no
 * anchor. There is no way to fix a claim except to change what the sentence says, and a
 * machine that changes what a sentence says is either inventing or deleting meaning. Those
 * still blank. Rule 4 fails on register, which is the same problem.
 *
 * Rule 7 fails on **punctuation**. An em dash is an AI tell, not an assertion — the sentence
 * means the same thing with a colon or a comma in its place, and swapping one glyph for
 * another introduces no claim and removes none. So the field ships as the model wrote it,
 * minus the tell, instead of shipping empty.
 *
 * **This is not a copy-polish stage.** 007 removed polish deliberately and nothing here
 * reinstates it: no field is rewritten, no field is improved, no model is involved, and the
 * only edit possible is one punctuation mark for another. Every repair is reported verbatim
 * on the REVIEW sheet with its before and after, because the machine changing a client's
 * page copy at all is something the owner should see, however narrow the change.
 *
 * The repair mirrors rule 7's own two branches: a single dash in a short field is a
 * title-style separator and becomes a colon; anything else is parenthetical and becomes
 * commas.
 */
export function repairPunctuation(text: string): string | null {
  if (!text.includes("\u2014")) return null;

  // A dash with nothing after it is not a separator; drop it rather than swap it, or
  // "Trailing dash \u2014" becomes "Trailing dash:".
  const text2 = text.replace(/\s*\u2014\s*$/, "");
  if (!text2.includes("\u2014")) return text2 === text ? null : text2.trim();

  const words = text2.split(/\s+/).filter(Boolean).length;
  const dashes = (text2.match(/\u2014/g) ?? []).length;

  const replaced =
    dashes === 1 && words < 15
      ? text2.replace(/\s*\u2014\s*/, ": ")
      : text2.replace(/\s*\u2014\s*/g, ", ");

  // A dash adjacent to punctuation or at a boundary leaves debris the swap would otherwise
  // ship: ", ." or a leading ": ".
  const cleaned = replaced
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/([,:;])\s*([,.:;])/g, "$2")
    .replace(/^[,:;]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned === text ? null : cleaned;
}

function getAtPath(root: unknown, path: string): string | undefined {
  const parts = path.split(".").flatMap((seg) => {
    const [name, ...idx] = seg.split("[");
    return [name, ...idx.map((i) => i.replace("]", ""))].filter(Boolean);
  });
  let node: unknown = root;
  for (const part of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

// ---------------------------------------------------------------------------
// Blanking, and the omission rule
// ---------------------------------------------------------------------------

function setAtPath(root: unknown, path: string, value: string): void {
  const parts = path.split(".").flatMap((seg) => {
    const [name, ...idx] = seg.split("[");
    return [name, ...idx.map((i) => i.replace("]", ""))].filter(Boolean);
  });
  let node = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
  node[parts[parts.length - 1]] = value;
}

/**
 * Which props a section type cannot render without. Derived from the Zod schema rather than
 * listed by hand, so a schema change cannot leave this stale: a prop is required exactly
 * when `.strict()`'s shape says it is.
 */
function requiredProps(type: SectionType): Set<string> {
  const schema = SECTION_PROP_SCHEMAS[type];
  return new Set(
    Object.entries(schema.shape)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([name]) => name),
  );
}

/** Required props of an array prop's item schema, e.g. `faq.items[]` → `question`, `answer`. */
function requiredItemProps(type: SectionType, arrayProp: string): Set<string> {
  const field = (SECTION_PROP_SCHEMAS[type].shape as Record<string, unknown>)[arrayProp];
  const element = (field as { element?: { shape?: Record<string, { safeParse(v: unknown): { success: boolean } }> } })
    ?.element;
  if (!element?.shape) return new Set();
  return new Set(
    Object.entries(element.shape)
      .filter(([, f]) => !f.safeParse(undefined).success)
      .map(([name]) => name),
  );
}

/**
 * Non-empty strings in a section, split by who wrote them. `client` is rail and passthrough
 * — the client's own content, which the floor never blanks. `any` includes surviving
 * generated copy. Machine values (hrefs, image paths, enums) are in neither: a section whose
 * only remaining string is a URL has nothing to render.
 */
function contentBySection(spec: SiteSpec): Map<string, { client: number; any: number }> {
  const { generated, rail, passthrough } = classifyStringPaths(spec);
  const counts = new Map<string, { client: number; any: number }>();
  const bump = (path: string, isClient: boolean) => {
    const m = path.match(/^pages\[\d+\]\.sections\[\d+\]/);
    if (!m) return;
    const row = counts.get(m[0]) ?? { client: 0, any: 0 };
    row.any += 1;
    if (isClient) row.client += 1;
    counts.set(m[0], row);
  };
  for (const e of [...rail, ...passthrough]) if (e.value.trim()) bump(e.path, true);
  for (const e of generated) if (e.value.trim()) bump(e.path, false);
  return counts;
}

/**
 * Run the floor and apply its consequences, in the order that destroys the least:
 * **repair, then blank, then prune the item, then — only if nothing is left — drop the
 * section.**
 *
 * **What 008 §10 was actually protecting, and what it was not.** The rule exists because
 * `z.string()` accepts `""`, so a blanked required field passes Zod and propagates into an
 * empty `<h2>` — omit-don't-placeholder, violated by a different route than `Lorem ipsum`.
 * That argument is about the *empty node*, and it is answered where empty nodes are made:
 * the section components now render nothing for an empty string rather than an empty tag.
 *
 * Dropping the section was a second, much larger consequence, and on real drafts it did real
 * damage every time. One draw put "Three Session Lengths" in a `pricing` heading, rule 2
 * fired on "three" because C4 holds three tiers, and the section was deleted — taking
 * $25/$40/$60 with it. The next draw put a count in a `hero` subheadline and deleted the
 * hero, headline and CTA included. Another blanked two FAQ answers out of five and deleted
 * all five. In every case the surviving material was fine and the page lost it anyway.
 *
 * So the consequence is now scaled to what actually broke:
 *
 * 1. **A blanked scalar** — the section keeps everything else and renders without that field.
 * 2. **A blanked required prop inside an array item** — that *item* goes, not the section,
 *    and only when the item is wholly generated. An item holding client content (a `services`
 *    entry whose `title` is a C2 label, a `feature` whose `title` is a B4 line) keeps the
 *    item and renders it partial, because deleting it would delete the client's words to
 *    punish the model's.
 * 3. **The section is dropped only when nothing renders** — every string gone, or a required
 *    array emptied by step 2. A `hero` with a headline still has a hero; a `faq` with no
 *    questions left does not.
 *
 * Rule 2 and its over-trigger are untouched. It fires correctly — "three" goes stale the
 * moment a fourth tier is added — and blanking is the right answer to it. Only the blast
 * radius was wrong.
 */
export function applyCopyFloor(
  spec: SiteSpec,
  intake: IntakeRecord,
): { spec: SiteSpec; report: CopyFloorReport } {
  const fieldsChecked = generatedStringPaths(spec).length;
  const next: SiteSpec = JSON.parse(JSON.stringify(spec));

  // Repair first, blank second. A field a punctuation swap clears never reaches blanking, so
  // the page ships the model's own words rather than an empty node.
  const firstPass = lintSpec(spec, intake);
  const attempted: Repair[] = [];
  for (const path of [...new Set(firstPass.map((v) => v.path))]) {
    const before = getAtPath(next, path);
    if (before === undefined) continue;
    const after = repairPunctuation(before);
    if (after === null) continue;
    setAtPath(next, path, after);
    attempted.push({ path, rule: 7, before, after });
  }

  // The second pass is authoritative: it judges the repaired spec, so a repair that did not
  // clear the field (rule 7 plus a claim violation on one string) is still caught, and a
  // repair cannot smuggle in a new violation.
  const violations = attempted.length ? lintSpec(next, intake) : firstPass;
  const failedPaths = [...new Set(violations.map((v) => v.path))];
  const repairs = attempted.filter((r) => !failedPaths.includes(r.path));

  for (const path of failedPaths) setAtPath(next, path, "");

  // First rule per path, not last: `new Map(violations.map(...))` keeps the final entry for
  // a duplicate key, so a heading tripping rules 2, 5 and 6 reported as rule 6.
  const firstRule = new Map<string, number>();
  for (const v of violations) if (!firstRule.has(v.path)) firstRule.set(v.path, v.rule);

  const omittedSections: string[] = [];
  const suppressedProps: SuppressedProp[] = [];
  const prunedItems: PrunedItem[] = [];

  // --- Step 2: prune wholly-generated array items that lost a required prop. -------------
  next.pages.forEach((page, pageIndex) => {
    page.sections.forEach((section, i) => {
      const type = section.type as SectionType;
      const props = section.props as Record<string, unknown>;
      const prefix = `pages[${pageIndex}].sections[${i}].props`;

      for (const [arrayProp, value] of Object.entries(props)) {
        if (!Array.isArray(value)) continue;
        const requiredForItem = requiredItemProps(type, arrayProp);
        if (!requiredForItem.size) continue;

        const kept = value.filter((item, index) => {
          if (item === null || typeof item !== "object") return true;
          const entries = Object.entries(item as Record<string, unknown>);

          const blankedRequired = entries.find(
            ([k, v]) => requiredForItem.has(k) && typeof v === "string" && !v.trim(),
          );
          if (!blankedRequired) return true;

          const holdsClientContent = entries.some(
            ([k, v]) =>
              typeof v === "string" &&
              v.trim() &&
              isClientSuppliedPath(`${type}.${arrayProp}[].${k}`),
          );
          if (holdsClientContent) return true;

          const path = `${prefix}.${arrayProp}[${index}].${blankedRequired[0]}`;
          prunedItems.push({
            sectionType: section.type,
            item: `${arrayProp}[${index}]`,
            prop: blankedRequired[0],
            rule: firstRule.get(path) ?? 0,
          });
          return false;
        });

        if (kept.length !== value.length) props[arrayProp] = kept;
      }
    });
  });

  // --- Step 3: drop only the sections that would render as nothing. ---------------------
  const content = contentBySection(next);

  next.pages.forEach((page, pageIndex) => {
    const doomed = new Set<number>();

    page.sections.forEach((section, i) => {
      const type = section.type as SectionType;
      const required = requiredProps(type);
      const props = section.props as Record<string, unknown>;
      const here = content.get(`pages[${pageIndex}].sections[${i}]`) ?? { client: 0, any: 0 };

      const emptyRequiredArray = [...required].find(
        (name) => Array.isArray(props[name]) && (props[name] as unknown[]).length === 0,
      );
      const rendersNothing = here.any === 0 || emptyRequiredArray !== undefined;

      const blankedRequired = [...required].filter(
        (name) => typeof props[name] === "string" && !(props[name] as string).trim(),
      );

      if (rendersNothing) {
        doomed.add(i);
        omittedSections.push(
          emptyRequiredArray
            ? `section omitted: ${section.type} — every \`${emptyRequiredArray}\` item was dropped, so there is nothing to render`
            : `section omitted: ${section.type} — every field is blank after the copy floor, so there is nothing to render`,
        );
        return;
      }

      for (const name of blankedRequired) {
        suppressedProps.push({
          sectionType: section.type,
          prop: name,
          rule: firstRule.get(`pages[${pageIndex}].sections[${i}].props.${name}`) ?? 0,
          survivingClientFields: here.client,
        });
      }
    });

    page.sections = page.sections.filter((_, i) => !doomed.has(i));
  });

  return {
    spec: next,
    report: {
      violations,
      failedPaths,
      fieldsChecked,
      omittedSections,
      suppressedProps,
      repairs,
      prunedItems,
    },
  };
}
