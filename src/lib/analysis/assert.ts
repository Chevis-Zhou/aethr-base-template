import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod/v4";
import { tokensSchema, sectionTypes, type SiteSpec } from "../assembly/site-spec";
import type { SectionType } from "../assembly/section-props";
import type { IntakeRecord } from "./intake";
import type { StructureResult } from "./structure";
import type { Tokens } from "./token-extraction";
import type { AttemptRecord, RunMeta } from "./generate";
import type { VerificationBuildResult, RunOutcome } from "./run";
import { classifyStringPaths } from "./rail";
import {
  allowedNumbers,
  digitsIn,
  PLACEHOLDERS,
  type CopyFloorReport,
} from "./copy-floor";
import { checkContrast } from "./contrast";

/**
 * The 008 §7 structural assertion suite — what the Maxematics replay (spine Phase 5) runs
 * against a provenance folder to tell "the pipeline still works" from "the prose changed."
 *
 * **Structural, never textual** (008 §7). No assertion here compares a string to the shipped
 * Maxematics copy, counts words, or checks that a heading matches a formula. Every check
 * reads `input.json`, `tokens.json`, `structure.json`, `spec.json`, `linter-report.json` and
 * `run.json` — the six files a run folder can be trusted to have — and is self-contained: it
 * re-derives its own answer rather than trusting another stage's report, per the ruling that
 * a suite which only re-reads `linter-report.json` isn't testing the floor, it's testing
 * whether the floor can write JSON.
 *
 * Usage:
 *   npx tsx src/lib/analysis/assert.ts --run <analysis/<ts>> [--only <name>[,<name>...]]
 *   npx tsx src/lib/analysis/assert.ts --run <analysis/<ts>> --expect <manifest.json>
 */

// ---------------------------------------------------------------------------
// Run folder
// ---------------------------------------------------------------------------

interface RunJson {
  slug: string;
  outcome: RunOutcome;
  driver: string;
  trigger: string;
  startedAt: string;
  attempts: AttemptRecord[];
  model: RunMeta | null;
  timings: Record<string, number>;
  verificationBuild: VerificationBuildResult;
  intakePath: string;
  reason: string | null;
}

interface RunFolder {
  dir: string;
  input: IntakeRecord;
  tokens: Tokens;
  structure: StructureResult;
  runJson: RunJson;
  /** null exactly when the run parked at three structural failures — 008 §4. */
  spec: SiteSpec | null;
  linterReport: CopyFloorReport | null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadRunFolder(dir: string): RunFolder {
  const p = (name: string) => join(dir, name);
  const specPath = p("spec.json");
  const linterPath = p("linter-report.json");
  return {
    dir,
    input: readJson<IntakeRecord>(p("input.json")),
    tokens: readJson<Tokens>(p("tokens.json")),
    structure: readJson<StructureResult>(p("structure.json")),
    runJson: readJson<RunJson>(p("run.json")),
    spec: existsSync(specPath) ? readJson<SiteSpec>(specPath) : null,
    linterReport: existsSync(linterPath) ? readJson<CopyFloorReport>(linterPath) : null,
  };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  ok: boolean;
  /** Informational checks print but never fail the suite — the archetype-diff check. */
  info?: boolean;
  message: string;
}

type Check = (rf: RunFolder) => CheckResult;

function pass(name: string, message: string): CheckResult {
  return { name, ok: true, message };
}

function fail(name: string, message: string): CheckResult {
  return { name, ok: false, message };
}

/** Every check that needs `spec.json` shares this guard — the structural control has none. */
function noSpec(name: string): CheckResult {
  return fail(name, "no spec.json in this run folder — the run parked (needs-attention)");
}

const checkTokensValid: Check = (rf) => {
  const name = "tokens-valid";
  const parsed = tokensSchema.safeParse(rf.tokens);
  if (!parsed.success) return fail(name, `tokens.json fails tokensSchema: ${z.prettifyError(parsed.error)}`);
  const t = parsed.data;

  for (const [key, raw] of [
    ["primaryHue", t.primaryHue],
    ["secondaryHue", t.secondaryHue],
    ["accentHue", t.accentHue],
  ] as const) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0 || n > 360) return fail(name, `${key} "${raw}" not in 0–360`);
  }

  for (const [key, raw] of [
    ["primarySaturation", t.primarySaturation],
    ["primaryLightness", t.primaryLightness],
    ["secondarySaturation", t.secondarySaturation],
    ["secondaryLightness", t.secondaryLightness],
    ["accentSaturation", t.accentSaturation],
    ["accentLightness", t.accentLightness],
  ] as const) {
    if (!/^\d+(\.\d+)?%$/.test(raw)) return fail(name, `${key} "${raw}" is not a percentage string`);
    const n = Number.parseFloat(raw);
    if (n < 0 || n > 100) return fail(name, `${key} "${raw}" not in 0–100%`);
  }

  if (!t.fontHeading.trim() || !t.fontBody.trim()) return fail(name, "fontHeading/fontBody must be non-empty");
  if (!/^-?\d+(\.\d+)?(rem|px|em)$/.test(t.radius)) return fail(name, `radius "${t.radius}" is not a CSS length`);

  return pass(name, "twelve tokens present, hues in-gamut, saturation/lightness 0–100%, radius a CSS length");
};

const checkPageCount: Check = (rf) => {
  const name = "page-count-matches-g1";
  if (!rf.spec) return noSpec(name);
  const expected = Math.min(Math.max(rf.input.G1, 1), 3);
  if (rf.spec.pages.length !== expected) {
    return fail(name, `spec has ${rf.spec.pages.length} page(s); expected ${expected} from G1=${rf.input.G1} (structure.ts clamps 1–3)`);
  }
  return pass(name, `${rf.spec.pages.length} page(s), matches G1=${rf.input.G1}`);
};

const checkHomePage: Check = (rf) => {
  const name = "home-page-present";
  if (!rf.spec) return noSpec(name);
  const homes = rf.spec.pages.filter((p) => p.slug === "/");
  if (homes.length !== 1) return fail(name, `expected exactly one page with slug "/", found ${homes.length}`);
  return pass(name, 'exactly one page with slug "/"');
};

const checkClosedPalette: Check = (rf) => {
  const name = "closed-section-palette";
  if (!rf.spec) return noSpec(name);
  const palette = new Set<string>(sectionTypes);
  const bad: string[] = [];
  for (const page of rf.spec.pages) {
    for (const section of page.sections) {
      if (!palette.has(section.type)) bad.push(`${page.slug}: "${section.type}"`);
    }
  }
  if (bad.length) return fail(name, `section type(s) outside the closed palette: ${bad.join(", ")}`);
  return pass(name, `every section type is one of the ${sectionTypes.length} closed types`);
};

const checkNoImpossibleSections: Check = (rf) => {
  const name = "no-impossible-sections";
  if (!rf.spec) return noSpec(name);
  const impossible = new Set<SectionType>(rf.structure.impossibleSections);
  const found: string[] = [];
  for (const page of rf.spec.pages) {
    for (const section of page.sections) {
      if (impossible.has(section.type as SectionType)) found.push(`${page.slug}: "${section.type}"`);
    }
  }
  if (found.length) return fail(name, `impossible section(s) emitted anyway: ${found.join(", ")}`);
  return pass(
    name,
    impossible.size
      ? `none of the ${impossible.size} impossible section(s) for this intake were emitted`
      : "no section is impossible for this intake",
  );
};

const checkRailVerbatim: Check = (rf) => {
  const name = "rail-verbatim";
  if (!rf.spec) return noSpec(name);

  const d1Values = new Set(rf.input.D1.map((r) => r.value));
  const c4Rows = new Set(rf.input.C4.map((r) => `${r.label}|${r.price}`));
  const d3Quotes = new Set(rf.input.D3.map((t) => t.quote));
  const problems: string[] = [];

  for (const page of rf.spec.pages) {
    for (const section of page.sections) {
      const props = section.props as Record<string, unknown>;

      if (section.type === "stats" && Array.isArray(props.stats)) {
        for (const s of props.stats as { value: string }[]) {
          if (!d1Values.has(s.value)) problems.push(`stats.value "${s.value}" not verbatim in D1`);
        }
      }
      if (section.type === "pricing" && Array.isArray(props.tiers)) {
        for (const t of props.tiers as { name: string; price: string }[]) {
          if (!c4Rows.has(`${t.name}|${t.price}`)) problems.push(`pricing tier "${t.name}|${t.price}" not verbatim in C4`);
        }
      }
      if (section.type === "testimonials" && Array.isArray(props.testimonials)) {
        for (const t of props.testimonials as { quote: string }[]) {
          if (!d3Quotes.has(t.quote)) problems.push(`testimonial quote not verbatim in D3: "${t.quote.slice(0, 40)}…"`);
        }
      }
    }
  }

  if (problems.length) return fail(name, problems.join("; "));
  return pass(name, "every stats value, pricing tier and testimonial quote on the spec traces verbatim to the intake");
};

/**
 * Rule 1, re-run rather than trusted from `linter-report.json` — a linter bug that stopped
 * reporting violations would otherwise pass this suite by construction.
 */
const checkNoInventedNumbers: Check = (rf) => {
  const name = "no-invented-numbers";
  if (!rf.spec) return noSpec(name);

  const allowed = allowedNumbers(rf.input);
  const generated = classifyStringPaths(rf.spec).generated;
  const problems: string[] = [];
  for (const entry of generated) {
    for (const n of digitsIn(entry.value)) {
      if (!allowed.has(n)) problems.push(`${entry.path}: digit "${n}"`);
    }
  }
  if (problems.length) return fail(name, problems.join("; "));
  return pass(name, `${generated.length} generated field(s) checked, no digit absent from D1/C4/G1`);
};

/** Rule 5, re-run over every string field including the rail — the floor's own scope is
 * generated-only, but a stale placeholder on a rail path is still a placeholder. */
const checkNoPlaceholderTokens: Check = (rf) => {
  const name = "no-placeholder-tokens";
  if (!rf.spec) return noSpec(name);

  const { generated, rail, passthrough } = classifyStringPaths(rf.spec);
  const all = [...generated, ...rail, ...passthrough];
  const problems: string[] = [];
  for (const entry of all) {
    const lower = entry.value.toLowerCase();
    for (const p of PLACEHOLDERS) {
      if (lower.includes(p)) problems.push(`${entry.path}: placeholder "${p}"`);
    }
  }
  if (problems.length) return fail(name, problems.join("; "));
  return pass(name, `${all.length} string field(s) checked (generated + rail + passthrough), no placeholder token`);
};

const checkCtaHref: Check = (rf) => {
  const name = "cta-href-matches-target";
  if (!rf.spec) return noSpec(name);

  const target = rf.structure.cta.href;
  const problems: string[] = [];

  for (const page of rf.spec.pages) {
    for (const section of page.sections) {
      const props = section.props as Record<string, unknown>;

      if (section.type === "hero" || section.type === "cta-band") {
        // B3=just-learn resolves to no target at all, and reconcile.ts leaves ctaHref
        // untouched in that case (008 §6's CTA-target rule has nothing to enforce).
        if (target === null) continue;
        if (props.ctaHref !== target) {
          problems.push(`${page.slug}.${section.type}.ctaHref "${String(props.ctaHref)}" !== "${target}"`);
        }
      }
      if (section.type === "pricing" && target !== null && Array.isArray(props.tiers)) {
        for (const tier of props.tiers as Record<string, unknown>[]) {
          if (tier.ctaHref !== undefined && tier.ctaHref !== target) {
            problems.push(`${page.slug}.pricing tier ctaHref "${String(tier.ctaHref)}" !== "${target}"`);
          }
        }
      }
    }
  }

  if (problems.length) return fail(name, problems.join("; "));
  return pass(
    name,
    target === null ? "B3=just-learn — no CTA target to enforce" : `every ctaHref resolves to "${target}"`,
  );
};

/**
 * Recomputes contrast from `tokens.json` rather than trusting anything in `flags.md` — no
 * run folder persists `ContrastReport` as JSON, so this is the only self-contained way to
 * check it. Confirms every pair below its AA threshold is one `checkContrast` actually
 * flagged, which is what would break if the flagging logic and the threshold ever drifted
 * apart.
 */
const checkContrastFlagsConsistent: Check = (rf) => {
  const name = "contrast-flags-consistent";
  const report = checkContrast(rf.tokens);
  const unflagged = report.results.filter((r) => !r.passes && !report.flags.some((f) => f.pair === r.pair));
  if (unflagged.length) {
    return fail(name, `pair(s) below AA but not flagged: ${unflagged.map((r) => r.pair).join(", ")}`);
  }
  const failing = report.results.filter((r) => !r.passes);
  return pass(
    name,
    failing.length
      ? `${failing.length}/${report.results.length} pair(s) below AA, all flagged`
      : `${report.results.length}/${report.results.length} pairs pass AA`,
  );
};

const checkRunOutcomeSane: Check = (rf) => {
  const name = "run-outcome-sane";
  const validOutcomes: RunOutcome[] = ["spec-ready", "spec-ready-with-flags", "needs-attention"];
  if (!validOutcomes.includes(rf.runJson.outcome)) {
    return fail(name, `outcome "${rf.runJson.outcome}" not one of ${validOutcomes.join("/")}`);
  }
  if (rf.runJson.attempts.length > 3) {
    return fail(name, `${rf.runJson.attempts.length} attempts recorded — 008 §4 caps at 3`);
  }
  return pass(name, `outcome "${rf.runJson.outcome}", ${rf.runJson.attempts.length} attempt(s)`);
};

/**
 * The structural control's own shape, per the Phase 3 ruling: rather than trying to validate
 * a `spec.json` that does not exist, assert the park itself is legitimate — outcome
 * `needs-attention`, no spec, three failed attempts and nothing more.
 */
const checkParkedRunShape: Check = (rf) => {
  const name = "parked-run-shape";

  if (rf.spec) {
    if (rf.runJson.outcome === "needs-attention") {
      return fail(name, "spec.json exists but outcome is needs-attention — inconsistent run record");
    }
    return pass(name, "not a parked run — spec.json present and outcome agrees");
  }

  if (rf.runJson.outcome !== "needs-attention") {
    return fail(name, `no spec.json but outcome is "${rf.runJson.outcome}", expected "needs-attention"`);
  }
  if (rf.runJson.attempts.length !== 3 || rf.runJson.attempts.some((a) => a.ok)) {
    return fail(
      name,
      `expected exactly 3 failed attempts, got ${rf.runJson.attempts.length} (ok: ${rf.runJson.attempts.map((a) => a.ok).join(",")})`,
    );
  }
  return pass(name, "no spec.json, outcome needs-attention, three recorded failures — a correctly parked run");
};

/**
 * Informational only, per the plan: never a failure. Prints what the model did with the
 * archetype's default order so the owner's eye has a structural diff to look at.
 */
const checkSectionDiffVsSkeleton: Check = (rf) => {
  const name = "section-diff-vs-skeleton";
  if (!rf.spec) return { name, ok: true, info: true, message: "no spec.json — nothing to diff" };

  const skeleton = rf.structure.skeleton.sections;
  const home = rf.spec.pages.find((p) => p.slug === "/");
  const emitted = home ? home.sections.map((s) => s.type) : [];

  const added = emitted.filter((t) => !skeleton.includes(t as SectionType));
  const removed = skeleton.filter((t) => !emitted.includes(t));
  const commonOrderMatches = emitted.filter((t) => skeleton.includes(t as SectionType)).join(",") ===
    skeleton.filter((t) => emitted.includes(t)).join(",");

  const parts: string[] = [];
  if (added.length) parts.push(`added: ${added.join(", ")}`);
  if (removed.length) parts.push(`removed: ${removed.join(", ")}`);
  if (!commonOrderMatches) parts.push("reordered");

  return {
    name,
    ok: true,
    info: true,
    message: parts.length ? parts.join("; ") : "matches the archetype skeleton exactly",
  };
};

/**
 * Every check's own `CheckResult.name` is the source of truth for `--only` — there is no
 * separate name registry to keep in sync with this list, on purpose.
 */
const CHECKS: Check[] = [
  checkTokensValid,
  checkPageCount,
  checkHomePage,
  checkClosedPalette,
  checkNoImpossibleSections,
  checkRailVerbatim,
  checkNoInventedNumbers,
  checkNoPlaceholderTokens,
  checkCtaHref,
  checkContrastFlagsConsistent,
  checkRunOutcomeSane,
  checkParkedRunShape,
  checkSectionDiffVsSkeleton,
];

// ---------------------------------------------------------------------------
// --expect mode
// ---------------------------------------------------------------------------

type LinterReportSpec =
  | { kind: "suppressedProp"; sectionType: string; prop: string; rule: number }
  | { kind: "prunedItem"; sectionType: string; item: string; prop: string; rule: number }
  | { kind: "failedPath"; path: string; rule?: number }
  | { kind: "repair"; path: string; rule: number; beforeContains?: string; afterExcludes?: string };

interface ExpectDefect {
  name: string;
  /** Substrings that must not appear anywhere in `spec.json` once the floor has run. */
  mustNotAppearInSpec: string[];
  /** The `linter-report.json` entry proving the floor is what removed it. */
  linterReport: LinterReportSpec;
}

interface ExpectManifest {
  defects: ExpectDefect[];
}

function linterReportHas(report: CopyFloorReport, spec: LinterReportSpec): boolean {
  switch (spec.kind) {
    case "suppressedProp":
      return report.suppressedProps.some(
        (p) => p.sectionType === spec.sectionType && p.prop === spec.prop && p.rule === spec.rule,
      );
    case "prunedItem":
      return report.prunedItems.some(
        (p) =>
          p.sectionType === spec.sectionType &&
          p.item === spec.item &&
          p.prop === spec.prop &&
          p.rule === spec.rule,
      );
    case "failedPath":
      return (
        report.failedPaths.includes(spec.path) &&
        (spec.rule === undefined || report.violations.some((v) => v.path === spec.path && v.rule === spec.rule))
      );
    case "repair":
      return report.repairs.some(
        (r) =>
          r.path === spec.path &&
          r.rule === spec.rule &&
          (!spec.beforeContains || r.before.includes(spec.beforeContains)) &&
          (!spec.afterExcludes || !r.after.includes(spec.afterExcludes)),
      );
  }
}

/**
 * Asserts the floor *caught* each planted defect — not that the spec looks bad (Phase 3's
 * ruling). A defect counts as caught when its string is gone from `spec.json` **and**
 * `linter-report.json` names the entry that removed it; either one alone could be a
 * coincidence (the model just didn't write it that way) or a lie (the report claims a fix
 * that never happened). Exits 0 when every defect in the manifest is confirmed caught —
 * the correct outcome on a working copy floor — and non-zero, naming the ones that leaked,
 * when it is not.
 */
function runExpect(rf: RunFolder, manifestPath: string): number {
  const manifest = readJson<ExpectManifest>(manifestPath);

  if (!rf.spec || !rf.linterReport) {
    console.error("--expect requires a run with spec.json and linter-report.json — this run parked before either was written.");
    return 1;
  }

  const specText = JSON.stringify(rf.spec);
  let failed = 0;

  for (const defect of manifest.defects) {
    const problems: string[] = [];
    for (const s of defect.mustNotAppearInSpec) {
      if (specText.includes(s)) problems.push(`"${s}" still present in spec.json`);
    }
    if (!linterReportHas(rf.linterReport, defect.linterReport)) {
      problems.push(`linter-report.json has no matching ${defect.linterReport.kind} entry`);
    }

    const ok = problems.length === 0;
    console.log(`[${ok ? "✓" : "✗"}] ${defect.name} — ${ok ? "caught by the copy floor" : problems.join("; ")}`);
    if (!ok) failed++;
  }

  console.log(
    `\n${manifest.defects.length - failed}/${manifest.defects.length} planted defect(s) confirmed caught` +
      (failed ? `, ${failed} NOT caught` : "") +
      ".",
  );
  return failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function usage(): void {
  console.error(
    "Usage: npx tsx src/lib/analysis/assert.ts --run <analysis/<ts>> [--only <name>[,<name>...]]\n" +
      "       npx tsx src/lib/analysis/assert.ts --run <analysis/<ts>> --expect <manifest.json>",
  );
}

if (process.argv[1]?.replace(/\\/g, "/").includes("analysis/assert")) {
  const runDir = arg("run");
  if (!runDir) {
    usage();
    process.exit(2);
  }

  const rf = loadRunFolder(resolve(runDir));

  const expectPath = arg("expect");
  if (expectPath) {
    process.exit(runExpect(rf, resolve(expectPath)));
  }

  const results = CHECKS.map((check) => check(rf));
  const only = arg("only");
  const wanted = only ? new Set(only.split(",")) : null;
  if (wanted) {
    const known = new Set(results.map((r) => r.name));
    for (const name of wanted) {
      if (!known.has(name)) {
        console.error(`No check named "${name}". Known: ${[...known].join(", ")}`);
        process.exit(2);
      }
    }
  }

  const toReport = wanted ? results.filter((r) => wanted.has(r.name)) : results;
  let failed = 0;
  for (const r of toReport) {
    const label = r.info ? "i" : r.ok ? "✓" : "✗";
    console.log(`[${label}] ${r.name} — ${r.message}`);
    if (!r.ok && !r.info) failed++;
  }

  console.log(`\n${toReport.length - failed}/${toReport.length} check(s) passed${failed ? `, ${failed} failed` : ""}.`);
  process.exit(failed ? 1 : 0);
}

export { loadRunFolder, CHECKS };
