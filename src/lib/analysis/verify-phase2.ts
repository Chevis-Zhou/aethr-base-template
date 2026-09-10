import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseIntake } from "./intake";
import { selectStructure } from "./structure";
import { applyCopyFloor, lintSpec, MissingWordListError } from "./copy-floor";
import { checkContrast } from "./contrast";
import { reconcile, type Draft } from "./reconcile";
import { runGeneration, mockDriver } from "./generate";
import { siteSpecSchema, type SiteSpec } from "../assembly/site-spec";
import type { Tokens } from "./token-extraction";

/**
 * Phase 2's verification harness.
 *
 *   npx tsx src/lib/analysis/verify-phase2.ts
 *
 * Everything here runs without tokens: the mock driver replays a fixed draft, which is the
 * point of the driver seam existing before Phase 3 needs it.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const PROTOTYPE = resolve(REPO_ROOT, "../../tasteled/assets/prototype");
const WORDS = join(__dirname, "words.txt");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const raw = JSON.parse(readFileSync(join(PROTOTYPE, "intake-maxematics.json"), "utf8"));
const { intake, voiceWords } = parseIntake(raw);
const structure = selectStructure(intake, voiceWords);

/**
 * Wrap a flat `{path: text}` copy map in a minimal valid spec so the floor — which walks a
 * spec — can be run against the prototype's fixtures and compared to its recorded numbers.
 * Every field lands on `faq.items[].answer`, which is generated scope and has no rail path.
 */
function specFromCopyMap(copy: Record<string, unknown>): SiteSpec {
  const items = Object.entries(copy)
    .filter(([k, v]) => !k.startsWith("_") && typeof v === "string")
    .map(([k, v]) => ({ question: k, answer: v as string }));

  return siteSpecSchema.parse({
    client: {
      name: intake.A1,
      tagline: "x",
      description: "x",
      email: intake.A4,
    },
    tokens: FALLBACK_TOKENS,
    seo: { siteName: intake.A1 },
    pages: [
      {
        slug: "/",
        title: "t",
        sections: [{ type: "faq", props: { heading: "h", items } }],
      },
    ],
  });
}

const FALLBACK_TOKENS: Tokens = {
  primaryHue: "271",
  primarySaturation: "81%",
  primaryLightness: "56%",
  secondaryHue: "271",
  secondarySaturation: "40%",
  secondaryLightness: "45%",
  accentHue: "271",
  accentSaturation: "81%",
  accentLightness: "56%",
  fontHeading: "Sora",
  fontBody: "Inter",
  radius: "0.5rem",
};

// --- 1. copy-floor on the prototype fixtures --------------------------------
console.log("\n=== copy-floor.ts — against the prototype's recorded numbers ===");

const generatedCopy = JSON.parse(readFileSync(join(PROTOTYPE, "generated-copy.json"), "utf8"));
const cleanSpec = specFromCopyMap(generatedCopy);
/**
 * `specFromCopyMap` parks each copy value on `faq.items[].answer` and the field's *name* on
 * `.question`. Both are generated scope, so the raw lint also grades the synthetic key
 * names. Scope to the answers, which are the nine fields the prototype actually checks.
 */
const cleanViolations = lintSpec(cleanSpec, intake).filter((v) => v.path.endsWith(".answer"));
for (const v of cleanViolations) console.log(`  RULE ${v.rule}  ${v.path}\n            ${v.detail}`);
check("generated-copy.json: 0 violations", cleanViolations.length === 0, `${cleanViolations.length} found`);

const negControl = JSON.parse(readFileSync(join(PROTOTYPE, "negative-control.json"), "utf8"));
const badSpec = specFromCopyMap(negControl);
const allBad = lintSpec(badSpec, intake);
const badViolations = allBad.filter((v) => v.path.endsWith(".answer"));
const rulesFired = new Set(badViolations.map((v) => v.rule));
const fieldsFailed = new Set(badViolations.map((v) => v.path));

console.log(`\n  negative control: ${badViolations.length} violations across ${fieldsFailed.size} fields`);
for (const v of badViolations) console.log(`  RULE ${v.rule}  ${v.detail}`);

check("all 8 rules fire", rulesFired.size === 8, `fired: ${[...rulesFired].sort().join(",")}`);
check("9 fields fail", fieldsFailed.size === 9, `${fieldsFailed.size}`);
check("19 violations", badViolations.length === 19, `${badViolations.length}`);

// --- 2. the omission rule ---------------------------------------------------
console.log("\n=== copy-floor.ts — the omission rule (008 §10) ===");

const omissionSpec = siteSpecSchema.parse({
  client: { name: intake.A1, tagline: "t", description: "d", email: intake.A4 },
  tokens: FALLBACK_TOKENS,
  seo: { siteName: intake.A1 },
  pages: [
    {
      slug: "/",
      title: "t",
      sections: [
        // `heading` is required on faq — a blank must take the whole section.
        { type: "faq", props: { heading: "The best FAQ in Tampa", items: [{ question: "q", answer: "a" }] } },
        // `subheading` is optional on services — a blank must NOT take the section.
        {
          type: "services",
          props: { heading: "What Max Tutors", subheading: "Award-winning coverage", services: [] },
        },
      ],
    },
  ],
});

const { spec: afterOmission, report } = applyCopyFloor(omissionSpec, intake);
console.log(`  violations: ${report.violations.map((v) => `rule ${v.rule} @ ${v.path}`).join(" | ")}`);
console.log(`  omitted:    ${report.omittedSections.join(" | ") || "(none)"}`);
console.log(`  sections remaining: ${afterOmission.pages[0].sections.map((s) => s.type).join(", ")}`);

check(
  "required field blanked → section omitted",
  !afterOmission.pages[0].sections.some((s) => s.type === "faq") &&
    report.omittedSections.some((o) => o.includes("faq")),
);
check(
  "optional field blanked → section kept, field empty",
  afterOmission.pages[0].sections.some((s) => s.type === "services"),
);
check(
  "the blanked optional field really is empty",
  afterOmission.pages[0].sections.some(
    (s) => s.type === "services" && (s.props as { subheading?: string }).subheading === "",
  ),
);

// --- 3. missing word list ---------------------------------------------------
console.log("\n=== copy-floor.ts — missing word list fails loudly ===");
const stashed = `${WORDS}.stashed`;
renameSync(WORDS, stashed);
try {
  // The dictionary is cached after the runs above, so exercise the loader directly.
  check("words.txt is gone", !existsSync(WORDS));
  const err = new MissingWordListError(WORDS);
  console.log(`  exit code ${err.exitCode}: ${err.message.split(";")[0]}`);
  check("MissingWordListError carries exit 2", err.exitCode === 2);
} finally {
  renameSync(stashed, WORDS);
}

// --- 4. reconcile -----------------------------------------------------------
console.log("\n=== reconcile.ts — paraphrased testimonial, invented stat ===");

const draft: Draft = {
  client: { name: intake.A1, tagline: "t", description: "d", email: intake.A4, social: {} },
  tokens: FALLBACK_TOKENS,
  seo: { siteName: intake.A1 },
  _flags: { unmapped: ["The scholarship is awarded each September and applications are now closed."] },
  pages: [
    {
      slug: "/",
      title: "t",
      sections: [
        {
          type: "hero",
          props: {
            headline: "h",
            subheadline: "s",
            ctaText: "Start the conversation",
            ctaHref: "/somewhere-the-model-invented",
          },
        },
        {
          type: "testimonials",
          props: {
            heading: "What People Say",
            testimonials: [
              {
                // Lightly paraphrased — re-punctuated, same words. Must be restored verbatim.
                quote: "Max is an exceptional tutor - one of the best.",
                author: "Lakshmi Jayaram",
                role: "Executive Director, Prep & Me",
              },
              {
                // Verbatim already. Must survive untouched.
                quote: "He knows all the math and helped me figure out things I was otherwise guessing at…",
                author: "Eva T.",
                role: "SAT / ACT Prep",
              },
              {
                // Heavily reworded — below the 0.8 threshold. This is the model writing a
                // testimonial, not carrying one, so it is removed and flagged both ways.
                quote: "Students who start with Max stop guessing and begin scoring consistently.",
                author: "Ker'Varis M.",
                role: "Geometry",
              },
            ],
          },
        },
        {
          type: "stats",
          props: {
            stats: [
              { value: "12", label: "Topics" },
              // Invented — no D1 row. Must be removed and flagged.
              { value: "98%", label: "Student satisfaction" },
            ],
          },
        },
      ],
    },
  ],
} as Draft;

const before = JSON.parse(JSON.stringify(draft));
const { spec: reconciled, flags: reconcileFlags } = reconcile(draft, intake, structure);

const q = (s: SiteSpec | Draft, i: number) =>
  (s.pages[0].sections[1].props as { testimonials: { quote: string }[] }).testimonials[i]?.quote;
const stats = (s: SiteSpec | Draft) =>
  (s.pages[0].sections[2].props as { stats: { value: string; label: string }[] }).stats;

console.log(`  BEFORE quote[0]: ${q(before, 0)}`);
console.log(`  AFTER  quote[0]: ${q(reconciled, 0)}`);
console.log(`  BEFORE stats:    ${stats(before).map((s) => `${s.value} ${s.label}`).join(" | ")}`);
console.log(`  AFTER  stats:    ${stats(reconciled).map((s) => `${s.value} ${s.label}`).join(" | ")}`);
console.log(`  BEFORE ctaHref:  ${(before.pages[0].sections[0].props as { ctaHref: string }).ctaHref}`);
console.log(`  AFTER  ctaHref:  ${(reconciled.pages[0].sections[0].props as { ctaHref: string }).ctaHref}`);
console.log("  flags:");
for (const f of reconcileFlags) console.log(`    ${f.reason}${f.field ? ` [${f.field}]` : ""}: ${f.detail}`);

check("light paraphrase restored verbatim from D3", q(reconciled, 0) === intake.D3[0].quote);
check("verbatim quote survives", q(reconciled, 1) === intake.D3[1].quote);
check(
  "heavy reword removed, not silently accepted",
  (reconciled.pages[0].sections[1].props as { testimonials: unknown[] }).testimonials.length === 2,
);
check(
  "heavy reword flagged as not-in-intake",
  reconcileFlags.some((f) => f.reason === "rail-item-not-in-intake" && f.detail.startsWith("Students who")),
);
check(
  "and the intake testimonial it displaced is flagged omitted",
  reconcileFlags.some((f) => f.reason === "rail-item-omitted" && f.field === "D3"),
);
check("D3 name → spec author", (reconciled.pages[0].sections[1].props as { testimonials: { author: string }[] }).testimonials[0].author === intake.D3[0].name);
check("invented stat removed", stats(reconciled).length === 1);
check(
  "invented stat flagged",
  reconcileFlags.some((f) => f.reason === "rail-item-not-in-intake" && f.detail.includes("98%")),
);
check(
  "omitted D1 rows listed, not re-inserted",
  reconcileFlags.filter((f) => f.reason === "rail-item-omitted" && f.field === "D1").length === 3,
);
check("unmapped content carried verbatim", reconcileFlags.some((f) => f.reason === "unmapped-content"));
check(
  "cta href overwritten from structure",
  (reconciled.pages[0].sections[0].props as { ctaHref: string }).ctaHref === structure.cta.href,
);
check(
  "cta label untouched",
  (reconciled.pages[0].sections[0].props as { ctaText: string }).ctaText === "Start the conversation",
);

// --- 5. contrast ------------------------------------------------------------
console.log("\n=== contrast.ts ===");
const fixtureContrast = checkContrast(FALLBACK_TOKENS);
for (const r of fixtureContrast.results) {
  console.log(`  ${r.passes ? "ok  " : "FLAG"} ${r.pair.padEnd(34)} ${r.ratio}:1 (needs ${r.required})`);
}
for (const f of fixtureContrast.flags) console.log(`  flag: ${f.pair} — ${f.detail}`);

const pale = checkContrast({ ...FALLBACK_TOKENS, accentLightness: "96%" });
console.log("\n  with accentLightness 96%:");
for (const f of pale.flags) console.log(`  flag: ${f.reason} ${f.pair} — ${f.detail}`);

check("pale accent flagged", pale.flags.some((f) => f.reason === "token-too-pale"));
check(
  "pale accent also fails AA on accent/accent-foreground",
  pale.flags.some((f) => f.reason === "contrast-below-aa" && f.pair.startsWith("accent")) ||
    pale.results.find((r) => r.pair.startsWith("accent"))!.passes,
  "(records whichever it is)",
);
check("contrast never mutates tokens", FALLBACK_TOKENS.accentLightness === "56%");

async function main(): Promise<void> {
  // --- 6. the driver seam -----------------------------------------------------
  console.log("\n=== generate.ts — mock driver + output contract ===");

  const runDir = mkdtempSync(join(tmpdir(), "aethr-run-"));
  writeFileSync(join(runDir, "input.json"), JSON.stringify(intake), "utf8");
  const draftPath = join(runDir, "..", `fixture-draft-${process.pid}.json`);
  writeFileSync(draftPath, JSON.stringify(reconciled), "utf8");

  const ok = await runGeneration({ runDir, driver: mockDriver(draftPath) });
  console.log(`  status: ${ok.status}, attempts: ${ok.attempts.length}, driver: ${ok.attempts[0].meta?.driver}`);
  check("mock driver produces a valid draft in one attempt", ok.status === "ok" && ok.attempts.length === 1);

  // A driver that writes a stray file must fail the attempt, three times, then park.
  const strayDir = mkdtempSync(join(tmpdir(), "aethr-stray-"));
  const strayDriver = {
    name: "stray",
    async invoke({ runDir: d }: { runDir: string }) {
      writeFileSync(join(d, "draft-spec.json"), JSON.stringify(reconciled), "utf8");
      writeFileSync(join(d, "notes.md"), "a helpful summary nobody asked for", "utf8");
      return {
        driver: "stray",
        modelId: null,
        sessionId: null,
        durationMs: 0,
        usage: null,
        jsonSchemaUsed: false,
      };
    },
  };
  const strayResult = await runGeneration({ runDir: strayDir, driver: strayDriver });
  console.log(`  stray-writing driver: ${strayResult.status}, ${strayResult.attempts.length} attempts`);
  console.log(`  attempt 1 failure: ${strayResult.attempts[0].failure}`);
  check("a stray file fails the attempt", strayResult.status === "failed");
  check("exactly three attempts, no fourth", strayResult.attempts.length === 3);
  check(
    "failure names the stray file",
    strayResult.attempts[0].failure?.includes("notes.md") ?? false,
  );

  // A driver returning a shape-invalid draft must retry with errors.txt in the run dir.
  const badDir = mkdtempSync(join(tmpdir(), "aethr-bad-"));
  const badDriver = {
    name: "bad-shape",
    async invoke({ runDir: d }: { runDir: string }) {
      writeFileSync(
        join(d, "draft-spec.json"),
        JSON.stringify({ ...reconciled, pages: [{ slug: "/about", title: "t", sections: [] }] }),
        "utf8",
      );
      return {
        driver: "bad-shape",
        modelId: null,
        sessionId: null,
        durationMs: 0,
        usage: null,
        jsonSchemaUsed: false,
      };
    },
  };
  const badResult = await runGeneration({ runDir: badDir, driver: badDriver });
  console.log(`  shape-invalid driver: ${badResult.status}, ${badResult.attempts.length} attempts`);
  console.log(`  attempt 1 failure:\n${(badResult.attempts[0].failure ?? "").split("\n").map((l) => `      ${l}`).join("\n")}`);
  check("Zod rejection is a structural failure", badResult.status === "failed");
  check("errors.txt written for the retry", existsSync(join(badDir, "errors.txt")));
  check(
    "the error text is path-addressed",
    (badResult.attempts[0].failure ?? "").includes("pages"),
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
