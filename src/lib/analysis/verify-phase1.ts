import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseIntake } from "./intake";
import { selectStructure } from "./structure";
import { classifyStringPaths } from "./rail";
import { loadExemplar } from "./exemplars";
import { siteSpecSchema } from "../assembly/site-spec";

/**
 * Phase 1's verification harness. Prints what the plan asks to see and exits non-zero on a
 * failed expectation.
 *
 *   npx tsx src/lib/analysis/verify-phase1.ts
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURE = resolve(REPO_ROOT, "../../tasteled/assets/prototype/intake-maxematics.json");
const ALL_SECTIONS = join(REPO_ROOT, "src/lib/assembly/sample-specs/_all-sections.json");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));

// --- 1. intake.ts ----------------------------------------------------------
console.log("\n=== intake.ts ===");
const { intake, voiceWords, flags: intakeFlags } = parseIntake(raw);
check("fixture parses", true, `A1=${intake.A1}, B3=${intake.B3}, G1=${intake.G1}`);
check("B6 in vocabulary", voiceWords.length === 3, JSON.stringify(voiceWords));
check("no B6 flags", intakeFlags.length === 0, JSON.stringify(intakeFlags));

console.log("\n--- broken closed field (E4) ---");
try {
  parseIntake({ ...raw, E4: "seasonal" });
  check("malformed E4 rejected", false, "it parsed");
} catch (err) {
  console.log((err as Error).message.trim());
  check("malformed E4 rejected", true);
}

console.log("\n--- stale B6 vocabulary is stripped, not rejected ---");
const stale = parseIntake({ ...raw, B6: ["clean", "modern", "warm"] });
console.log(`  voiceWords: ${JSON.stringify(stale.voiceWords)}`);
console.log(`  flags:      ${JSON.stringify(stale.flags)}`);
check(
  "stale B6 stripped and flagged",
  stale.voiceWords.length === 1 && stale.flags.length === 1,
);

// --- 2. structure.ts -------------------------------------------------------
console.log("\n=== structure.ts ===");
const structure = selectStructure(intake, voiceWords);
console.log(JSON.stringify(structure, null, 2));

check("archetype is solo-professional", structure.archetype === "solo-professional");
check("one page", structure.pages.length === 1, structure.pages.map((p) => p.slug).join(", "));
check("CTA href is #contact", structure.cta.href === "#contact", structure.cta.derivedFrom);
check(
  "portfolio impossible (C5 empty)",
  structure.impossibleSections.includes("portfolio"),
  structure.impossibleSections.join(", "),
);
check(
  "disclosure impossible, unflagged (C7 empty is normal)",
  structure.impossibleSections.includes("disclosure") &&
    !structure.flags.some((f) => f.message.includes("disclosure")),
);
const withDisclosure = selectStructure(
  { ...intake, C7: "Securities offered through Example LLC, member FINRA/SIPC." },
  voiceWords,
);
check(
  "C7 present → disclosure reachable",
  !withDisclosure.impossibleSections.includes("disclosure"),
);
check(
  "faq flagged unseeded (D5 empty)",
  structure.flags.some((f) => f.reason === "faq-unseeded"),
);
check(
  "skeleton excludes every impossible section",
  structure.skeleton.sections.every((s) => !structure.impossibleSections.includes(s)),
  structure.skeleton.sections.join(" → "),
);

console.log("\n--- CTA branches ---");
for (const b3 of ["enquire", "book", "call", "buy", "apply", "just-learn"] as const) {
  const r = selectStructure({ ...intake, B3: b3 }, voiceWords);
  const unruled = r.flags.filter((f) => f.reason === "cta-target-unruled").length;
  console.log(`  B3=${b3.padEnd(11)} href=${String(r.cta.href).padEnd(22)} ${r.cta.derivedFrom}`);
  if ((b3 === "buy" || b3 === "apply") && unruled !== 1) {
    check(`B3=${b3} always flags unruled`, false);
  }
}
check("buy/apply always flagged", true);

const booking = selectStructure({ ...intake, B3: "book", A8: "https://cal.com/max" }, voiceWords);
check("book → A8", booking.cta.href === "https://cal.com/max", booking.cta.derivedFrom);
const noBooking = selectStructure({ ...intake, B3: "book" }, voiceWords);
check(
  "book with empty A8 falls back + flags",
  noBooking.cta.href === "#contact" &&
    noBooking.flags.some((f) => f.reason === "cta-fallback-no-booking-url"),
);
const calling = selectStructure({ ...intake, B3: "call" }, voiceWords);
check("call → tel:A5", calling.cta.href === "tel:8134446199", calling.cta.derivedFrom);
const justLearn = selectStructure({ ...intake, B3: "just-learn" }, voiceWords);
check(
  "just-learn emits no CTA and drops cta-band",
  justLearn.cta.href === null && !justLearn.skeleton.sections.includes("cta-band"),
);

console.log("\n--- G1 sizing ---");
for (const g1 of [1, 2, 3]) {
  const r = selectStructure({ ...intake, G1: g1 }, voiceWords);
  console.log(`  G1=${g1} → ${r.pages.map((p) => p.slug).join(", ")}`);
  if (r.pages.length !== g1) check(`G1=${g1} yields ${g1} pages`, false);
}
check("G1 sizes the page set", true);

// --- 3. rail.ts ------------------------------------------------------------
console.log("\n=== rail.ts — classified over _all-sections.json ===");
const spec = siteSpecSchema.parse(JSON.parse(readFileSync(ALL_SECTIONS, "utf8")));
const { generated, rail, passthrough } = classifyStringPaths(spec);

console.log(`\nRAIL (${rail.length}) — overwritten verbatim, exempt from every linter rule:`);
for (const p of rail) console.log(`  ${p.canonical.padEnd(42)} ${p.path}`);

console.log(`\nPASSTHROUGH (${passthrough.length}) — client identity, out of linter scope:`);
for (const p of passthrough) console.log(`  ${p.canonical.padEnd(42)} ${p.path}`);

console.log(`\nGENERATED (${generated.length}) — the linter's scope:`);
for (const p of generated) console.log(`  ${p.canonical.padEnd(42)} ${p.path}`);

check("rail paths found", rail.length > 0);
check("generated paths found", generated.length > 0);
check(
  "no generated path is a rail path",
  generated.every((g) => !rail.some((r) => r.canonical === g.canonical)),
);
check(
  "no href/icon/image in generated scope",
  generated.every((g) => !/href|icon|image|logo|avatar|link$/i.test(g.canonical)),
);
check(
  "every generated value is a string",
  generated.every((g) => typeof g.value === "string"),
);

// --- 4. exemplars ----------------------------------------------------------
console.log("\n=== exemplars ===");
const picked = structure.register;
console.log(`  register: ${picked.register} (${picked.reason})`);
check("Maxematics → practice-credibility", picked.register === "practice-credibility");

const exemplar = loadExemplar(picked.register);
check("exemplar loads", exemplar !== null, `${exemplar?.body.length ?? 0} chars`);
check("local-service returns null", loadExemplar("local-service") === null);
for (const r of ["institutional-advisory", "warm-advisory", "direct-response"] as const) {
  check(`${r} exemplified`, loadExemplar(r) !== null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
