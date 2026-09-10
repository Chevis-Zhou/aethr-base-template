import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseIntake } from "./intake";
import { selectStructure } from "./structure";
import { loadExemplar, isUnexemplified } from "./exemplars";
import { extractTokens, type Tokens } from "./token-extraction";
import { runGeneration, claudeDriver } from "./generate";

/**
 * One real generation against the Maxematics context — the end-to-end smoke test for stage
 * (c). Spends subscription tokens, so it is a separate command rather than part of
 * `verify-phase2.ts`.
 *
 *   npx tsx src/lib/analysis/real-run.ts              # with --json-schema
 *   NO_JSON_SCHEMA=1 npx tsx src/lib/analysis/real-run.ts
 *   SKIP_EXTRACTION=1 npx tsx src/lib/analysis/real-run.ts   # fallback tokens, no Playwright
 *
 * This is **not** the runner. It builds a run directory, calls `runGeneration`, and prints
 * what came back. Provenance, the flags sheet and the verification build are Phase 3's.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURE = resolve(REPO_ROOT, "../../tasteled/assets/prototype/intake-maxematics.json");

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

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const { intake, voiceWords, flags: intakeFlags } = parseIntake(raw);
  const structure = selectStructure(intake, voiceWords);

  console.log(`client:    ${intake.A1}`);
  console.log(`archetype: ${structure.archetype}`);
  console.log(`register:  ${structure.register.register} (${structure.register.reason})`);
  console.log(`cta:       ${structure.cta.href} — ${structure.cta.derivedFrom}`);
  console.log(`impossible: ${structure.impossibleSections.join(", ")}`);
  if (intakeFlags.length) console.log(`intake flags: ${JSON.stringify(intakeFlags)}`);

  // Stage (a). Real extraction unless skipped; the fallback shape is the same either way.
  let tokens = FALLBACK_TOKENS;
  if (!process.env.SKIP_EXTRACTION) {
    console.log(`\nextracting tokens from ${intake.E1} …`);
    const result = await extractTokens({
      referenceUrl: intake.E1,
      accent: intake.E3.startsWith("#") ? { mode: "hex", hex: intake.E3 } : { mode: "you-choose" },
      typeFeel: intake.E5,
    });
    tokens = result.tokens;
    console.log(`  status: ${result.status}${result.flag ? ` — ${result.flag.reason}` : ""}`);
  }
  console.log(`  tokens: ${tokens.fontHeading}/${tokens.fontBody}, primary ${tokens.primaryHue} ${tokens.primarySaturation} ${tokens.primaryLightness}`);

  // Guard 2's run directory: only the context files go in.
  const runDir = mkdtempSync(join(tmpdir(), "aethr-real-"));
  const write = (name: string, body: string) => writeFileSync(join(runDir, name), body, "utf8");

  write("input.json", JSON.stringify(intake, null, 2));
  write("tokens.json", JSON.stringify(tokens, null, 2));
  write("structure.json", JSON.stringify(structure, null, 2));
  write("voice-words.json", JSON.stringify(voiceWords, null, 2));

  const exemplar = loadExemplar(structure.register.register);
  if (exemplar) write("exemplar.md", exemplar.body);
  else console.log(`  register ${structure.register.register} is unexemplified — no exemplar.md`);
  console.log(`\nrun dir: ${runDir}`);

  const useJsonSchema = !process.env.NO_JSON_SCHEMA;
  console.log(`--json-schema: ${useJsonSchema ? "on" : "off"}\n`);

  const started = Date.now();
  const result = await runGeneration({ runDir, driver: claudeDriver, useJsonSchema });

  console.log(`status:   ${result.status}`);
  console.log(`attempts: ${result.attempts.length}`);
  for (const a of result.attempts) {
    console.log(`  #${a.attempt} ${a.ok ? "ok" : "FAILED"}${a.failure ? `\n     ${a.failure.split("\n").join("\n     ")}` : ""}`);
    if (a.meta) {
      console.log(`     model=${a.meta.modelId} session=${a.meta.sessionId} ${a.meta.durationMs}ms jsonSchema=${a.meta.jsonSchemaUsed}`);
    }
  }
  console.log(`wall clock: ${Math.round((Date.now() - started) / 1000)}s`);

  if (result.status === "ok") {
    const draft = result.draft as { pages: { slug: string; sections: { type: string }[] }[]; _flags?: unknown };
    console.log(`\npages: ${draft.pages.map((p) => `${p.slug} [${p.sections.map((s) => s.type).join(" → ")}]`).join("  ")}`);
    if (draft._flags) console.log(`_flags: ${JSON.stringify(draft._flags)}`);
    console.log(`\nraw draft: ${join(runDir, "draft-spec.json")}`);
    if (isUnexemplified(structure.register.register)) {
      console.log("NOTE: register unexemplified — generated on the house register.");
    }
  }

  console.log("\nThe copy is not judged here. That is the flags sheet and the owner's eye.");
}

void main();
