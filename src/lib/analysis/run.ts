import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { siteSpecSchema, type SiteSpec } from "../assembly/site-spec";
import { assembleFromSpec } from "../assembly/assemble";
import { z } from "zod/v4";
import { parseIntake, type IntakeFlag, type IntakeRecord } from "./intake";
import { selectStructure, type StructureResult } from "./structure";
import { loadExemplar, isUnexemplified } from "./exemplars";
import {
  buildFallbackTokens,
  extractTokens,
  type Tokens,
  type TokenExtractionResult,
} from "./token-extraction";
import {
  claudeDriver,
  mockDriver,
  runGeneration,
  type AttemptRecord,
  type Driver,
  type RunMeta,
  type VerifyOutcome,
} from "./generate";
import { reconcile, type ReconcileResult } from "./reconcile";
import { applyCopyFloor, type CopyFloorReport } from "./copy-floor";
import { checkContrast, type ContrastReport } from "./contrast";
import { classifyStringPaths } from "./rail";

/**
 * ANALYSIS's orchestrator — stages (a) through (d), the provenance folder, and the REVIEW
 * flags sheet.
 *
 *   npx tsx src/lib/analysis/run.ts --intake <intake.json> --client-dir <Business/clients/slug>
 *     [--driver claude|mock] [--draft <path>] [--skip-tokens] [--no-build]
 *
 * Three properties this file is responsible for, all of them 008's:
 *
 * 1. **Everything is written as it completes.** A crash between stages leaves a readable
 *    partial record rather than nothing. The run folder is the artifact; the return value
 *    is a convenience.
 * 2. **`state.md` is never written.** It is `propose`-class — the portal renders it to the
 *    client — so the runner prints the one line and the owner pastes it. The provenance
 *    folder is `auto`-class and writes itself.
 * 3. **Two run folders under one client IS the rejection record** 019 §4 measures. There is
 *    no counter, no log, no rejection field. Do not add one.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
/** Tracked files `assemble.ts` overwrites. STATE.md: "a verification build is throwaway." */
const ASSEMBLER_TRACKED_OUTPUTS = ["src/app/page.tsx", "src/lib/client-config.ts"];

export type RunOutcome = "spec-ready" | "spec-ready-with-flags" | "needs-attention";

export interface RunReport {
  outcome: RunOutcome;
  runDir: string;
  slug: string;
  attempts: AttemptRecord[];
  stateLine: string;
}

// ---------------------------------------------------------------------------
// The verification build (stage d)
// ---------------------------------------------------------------------------

export interface VerificationBuildResult {
  ran: boolean;
  ok: boolean;
  exitCode: number | null;
  /** Last 40 lines of combined output. The whole log is noise; the tail is the error. */
  tail: string;
  durationMs: number;
}

function git(args: string[]): void {
  execFileSync("git", args, { cwd: REPO_ROOT, stdio: "pipe" });
}

/**
 * Assemble the spec, run a real production build, then put the repo back exactly as it was.
 *
 * **Named `verificationBuild`, never `build`.** The map's BUILD stage means build-for-
 * staging-and-QA; this is a throwaway oracle that runs before REVIEW and leaves nothing
 * behind. Conflating the two is how a "verified" spec ends up deployed.
 */
export async function verificationBuild(
  specPath: string,
  slugs: string[],
): Promise<VerificationBuildResult> {
  const started = Date.now();
  const createdPages = slugs
    .filter((s) => s !== "/")
    .map((s) => join(REPO_ROOT, "src/app", s.replace(/^\//, ""), "page.tsx"));

  try {
    await assembleFromSpec(specPath, REPO_ROOT);

    const { code, tail } = await new Promise<{ code: number | null; tail: string }>((res) => {
      const child = spawn("pnpm", ["build"], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("error", (err) => res({ code: null, tail: `pnpm build could not start: ${err.message}` }));
      child.on("close", (c) => res({ code: c, tail: out.trimEnd().split("\n").slice(-40).join("\n") }));
    });

    return { ran: true, ok: code === 0, exitCode: code, tail, durationMs: Date.now() - started };
  } catch (err) {
    return {
      ran: true,
      ok: false,
      exitCode: null,
      tail: `assembleFromSpec threw: ${(err as Error).message}`,
      durationMs: Date.now() - started,
    };
  } finally {
    // Restore unconditionally — including on the failure path, where leaving a half-built
    // repo behind is exactly how the next run gets a confusing diff.
    git(["checkout", "--", ...ASSEMBLER_TRACKED_OUTPUTS]);
    for (const page of createdPages) {
      if (!existsSync(page)) continue;
      let tracked = true;
      try {
        git(["ls-files", "--error-unmatch", page]);
      } catch {
        tracked = false;
      }
      if (!tracked) rmSync(page, { force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// The flags sheet (008 §6, artifacts 2 and 3)
// ---------------------------------------------------------------------------

interface SheetInput {
  intake: IntakeRecord;
  intakeFlags: IntakeFlag[];
  voiceWords: string[];
  structure: StructureResult;
  extraction: TokenExtractionResult | null;
  tokens: Tokens;
  contrast: ContrastReport;
  reconciled: ReconcileResult;
  floor: CopyFloorReport;
  spec: SiteSpec;
  build: VerificationBuildResult;
  outcome: RunOutcome;
}

function bullets(lines: string[]): string {
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- _none_";
}

/**
 * The REVIEW sheet. Plain Markdown, **no editing affordance of any kind** — 007 ruled the
 * copy pass read-only, and an inline editor here would quietly reinstate the polish step it
 * removed. A correction found on this sheet goes back as a re-run or to the client.
 */
export function buildFlagsSheet(i: SheetInput): string {
  const s: string[] = [];
  const { intake, structure } = i;

  s.push(`# REVIEW — ${intake.A1}`);
  s.push("");
  s.push(`Outcome: **${i.outcome}**. Generated by ANALYSIS; read-only.`);
  s.push("");

  // 1 — the owner's line. First, unanswered, and never answered by the machine.
  s.push("## Is the client asking for the wrong site?");
  s.push("");
  s.push("_Unanswered by design — ten seconds of the owner's judgement, against the four fields below._");
  s.push("");
  s.push(`- **B1** what they do: ${intake.B1}`);
  s.push(`- **B2** who it is for: ${intake.B2.join(", ")}`);
  s.push(`- **B3** what a visitor should do: ${intake.B3}`);
  s.push(`- **A9** their current site: ${intake.A9 ? intake.A9 : "_not given_"}`);
  s.push("");

  // 2 — G3 verbatim. 004: the deliberately-unparsed field where the most important
  // sentence in the Maxematics engagement would have landed.
  s.push("## G3 — anything else, verbatim");
  s.push("");
  s.push(intake.G3?.trim() ? "> " + intake.G3.trim().split("\n").join("\n> ") : "_empty_");
  s.push("");

  // 3 — the copy floor's structural consequences, surfaced before the detail. A section
  // that lost a heading but kept the client's content is the highest-value line on this
  // sheet after the wrong-site check, and it must not read as one row among nine.
  s.push("## Sections the copy floor changed");
  s.push("");
  if (i.floor.suppressedProps.length) {
    s.push("**Kept, with a required field blanked.** The client's own content in these sections is intact and rendered; only the generated field is gone. Nothing here was invented and nothing was lost.");
    s.push("");
    s.push(
      bullets(
        i.floor.suppressedProps.map(
          (p) =>
            `\`${p.sectionType}\` — **${p.prop}** blanked by rule ${p.rule}; ${p.survivingClientFields} client-supplied field(s) still rendering, so the section stays and renders without it`,
        ),
      ),
    );
  } else {
    s.push("- _no section lost a required field_");
  }
  s.push("");
  if (i.floor.repairs.length) {
    s.push("");
    s.push("**Repaired, not blanked.** The only violation on these fields was punctuation (rule 7), which a machine can fix without changing what the sentence says — so the field ships as the model wrote it, minus the em dash, rather than shipping empty. No other rule is repairable, and no model was involved. Both versions are shown because the machine editing page copy at all is something you should see.");
    s.push("");
    s.push("| path | before | after |");
    s.push("|---|---|---|");
    for (const r of i.floor.repairs) {
      const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
      s.push(`| \`${r.path}\` | ${cell(r.before)} | ${cell(r.after)} |`);
    }
  }
  s.push("");
  if (i.floor.prunedItems.length) {
    s.push("**One item dropped, section kept.** A required field blanked inside a list item that held no client content, so the item went and the rest of the list stayed. An item carrying the client's own words is never dropped — it renders partial instead, because deleting it would delete their content to punish the model's.");
    s.push("");
    s.push(
      bullets(
        i.floor.prunedItems.map(
          (p) => `\`${p.sectionType}\` — \`${p.item}\` removed; **${p.prop}** blanked by rule ${p.rule}`,
        ),
      ),
    );
    s.push("");
  }

  // Page-level generated fields are not section props, so the omission rule above cannot
  // reach them and there is deliberately no fallback name: inventing a page title is the
  // same invention the floor exists to stop. A blank one ships, and it ships loudly here.
  const blankedPageFields = i.floor.failedPaths.filter((path) => !/\.sections\[/.test(path));
  if (blankedPageFields.length) {
    s.push("**Page-level fields blanked — needs a human.** These are not section props, so nothing omits them and nothing substitutes for them. A blank `<title>` ships unless you supply one. No fallback is generated on purpose: a made-up page title is exactly the invention the copy floor exists to prevent.");
    s.push("");
    s.push(
      bullets(
        blankedPageFields.map((path) => {
          const rule = i.floor.violations.find((v) => v.path === path)?.rule ?? 0;
          return `\`${path}\` — blanked by rule ${rule}`;
        }),
      ),
    );
    s.push("");
  }

  s.push("**Dropped entirely** — nothing was left to render after the floor:");
  s.push("");
  s.push(bullets(i.floor.omittedSections));
  s.push("");

  // 4 — archetype.
  s.push("## Archetype and register");
  s.push("");
  s.push(`- archetype: **${structure.archetype}**, chosen by B2 = ${structure.archetypeChosenBy.join(", ") || "_fallback_"}`);
  s.push(`- B3 (CTA target): ${intake.B3} → \`${structure.cta.href ?? "no CTA sections"}\` (${structure.cta.derivedFrom})`);
  s.push(`- register: **${structure.register.register}** — ${structure.register.reason}`);
  if (isUnexemplified(structure.register.register)) {
    s.push(`- ⚠ register **unexemplified** — no exemplar on disk; generated on the house register alone`);
  }
  s.push(`- B6 voice words used: ${i.voiceWords.join(", ") || "_none_"}`);
  for (const f of i.intakeFlags) {
    s.push(`- ⚠ B6 out-of-vocabulary, stripped: ${f.detail.join(", ")}`);
  }
  s.push(bullets(structure.flags.map((f) => `${f.reason} — ${f.message}`)));
  s.push("");

  // 5 — token extraction.
  s.push("## Token extraction");
  s.push("");
  s.push(`- reference URL (E1): ${intake.E1}`);
  if (i.extraction) {
    s.push(`- status: **${i.extraction.status}**`);
    if (i.extraction.flag) {
      s.push(`- ⚠ ${i.extraction.flag.reason} — ${i.extraction.flag.message}`);
    }
  } else {
    s.push("- status: **skipped** (`--skip-tokens`) — the house fallback palette was used");
  }
  s.push("");
  s.push("| token | value |");
  s.push("|---|---|");
  for (const [k, v] of Object.entries(i.tokens)) s.push(`| ${k} | \`${v}\` |`);
  s.push("");

  // 6 — contrast.
  s.push("## Contrast");
  s.push("");
  s.push("| pair | ratio | required | |");
  s.push("|---|---|---|---|");
  for (const r of i.contrast.results) {
    s.push(`| ${r.pair} | ${r.ratio}:1 | ${r.required}:1 | ${r.passes ? "pass" : "**FAIL**"} |`);
  }
  s.push("");
  if (i.contrast.flags.length) {
    s.push(bullets(i.contrast.flags.map((f) => `⚠ ${f.reason} — ${f.pair}: ${f.detail}`)));
    s.push("");
  }

  // 7 — structure as emitted, against what was possible.
  s.push("## Sections emitted");
  s.push("");
  for (const page of i.spec.pages) {
    s.push(`- \`${page.slug}\` — ${page.sections.map((x) => x.type).join(" → ")}`);
  }
  s.push("");
  s.push("Not available to this intake (the field that feeds them is empty — *impossible*, not a model choice):");
  s.push("");
  s.push(bullets(structure.impossibleSections));
  s.push("");
  const emitted = new Set(i.spec.pages.flatMap((p) => p.sections.map((x) => x.type)));
  const skeletonMisses = structure.skeleton.sections.filter((t) => !emitted.has(t));
  s.push("In the archetype's default order but not emitted (*the model's choice* — ruling 10 permits it):");
  s.push("");
  s.push(bullets(skeletonMisses));
  s.push("");

  // 8 — rail reconciliation.
  s.push("## Rail reconciliation");
  s.push("");
  s.push("The eight verbatim fields are overwritten from the intake record mechanically after generation. Anything below is a place the model and the record disagreed.");
  s.push("");
  s.push(
    bullets(
      i.reconciled.flags
        .filter((f) => f.reason !== "unmapped-content")
        .map((f) => `${f.reason}${f.field ? ` (${f.field})` : ""} — ${f.detail}`),
    ),
  );
  s.push("");

  // 9 — copy floor detail.
  s.push("## Copy floor");
  s.push("");
  s.push(`${i.floor.fieldsChecked} generated field(s) checked; ${i.floor.violations.length} violation(s) across ${i.floor.failedPaths.length} field(s). Every failing field is blank in the emitted spec. **Violations are never fed back to the model** (008 §10).`);
  s.push("");
  s.push(bullets(i.floor.violations.map((v) => `\`${v.path}\` — rule ${v.rule}: ${v.detail}`)));
  s.push("");

  // 10 — unmapped content, verbatim.
  s.push("## Unmapped content, verbatim");
  s.push("");
  s.push("Content the model could not place in any section. 004 §8 ruled against a thirteenth `unmapped` section type — it reaches REVIEW as text, unsummarised, or not at all.");
  s.push("");
  s.push(
    bullets(
      i.reconciled.flags.filter((f) => f.reason === "unmapped-content").map((f) => f.detail),
    ),
  );
  s.push("");

  // 11 — the verification build.
  s.push("## Verification build");
  s.push("");
  if (!i.build.ran) {
    s.push("- **not run** (`--no-build`). The spec has not been proven buildable.");
  } else {
    s.push(`- ${i.build.ok ? "**passed**" : "**FAILED**"} (exit ${i.build.exitCode}, ${Math.round(i.build.durationMs / 1000)}s)`);
    if (!i.build.ok) {
      s.push("");
      s.push("```");
      s.push(i.build.tail);
      s.push("```");
    }
  }
  s.push("");

  // 12 — artifact 3, the copy pane, in its simplest form.
  s.push("## Every generated string, read-only");
  s.push("");
  s.push("Artifact 3 (007 constraints item 4) as Markdown. Rail and passthrough fields are the client's own words and are excluded — they are never linted and never rewritten. **Read-only is the point**: a correction found here is a re-run or a message to the client, never an inline edit.");
  s.push("");
  const classified = classifyStringPaths(i.spec);
  s.push("| path | value |");
  s.push("|---|---|");
  for (const e of classified.generated) {
    const v = e.value === "" ? "_(blanked by the copy floor)_" : e.value.replace(/\|/g, "\\|").replace(/\n/g, " ");
    s.push(`| \`${e.path}\` | ${v} |`);
  }
  s.push("");
  s.push(`_${classified.rail.length} rail and ${classified.passthrough.length} passthrough field(s) not shown — client-supplied, out of scope._`);
  s.push("");

  return s.join("\n");
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/** The poke. The run folder is the queue — 008 §6 is explicit that this is not one. */
function notify(slug: string, outcome: RunOutcome): void {
  const message =
    outcome === "needs-attention" ? "Needs attention" : "Spec ready";
  try {
    execFileSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(`${slug} — ${message}`)} with title "ANALYSIS"`,
    ]);
  } catch {
    // A missing notification must never fail a run that otherwise succeeded.
  }
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

export interface RunOptions {
  intakePath: string;
  clientDir: string;
  driver?: Driver;
  skipTokens?: boolean;
  runBuild?: boolean;
}

export async function run(opts: RunOptions): Promise<RunReport> {
  const timings: Record<string, number> = {};
  const stage = async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
    const t = Date.now();
    const out = await fn();
    timings[name] = Date.now() - t;
    return out;
  };

  const clientDir = resolve(opts.clientDir);
  const slug = basename(clientDir);
  const driver = opts.driver ?? claudeDriver;

  // Stage (a) part 1 — the intake record. A closed-vocabulary violation throws here, before
  // anything is written; a client with a malformed record has no run to record.
  const raw = JSON.parse(readFileSync(resolve(opts.intakePath), "utf8"));
  const { intake, voiceWords, flags: intakeFlags } = parseIntake(raw);

  const runDir = join(clientDir, "analysis", new Date().toISOString().replace(/:/g, "-"));
  mkdirSync(runDir, { recursive: true });
  const write = (name: string, body: string) => writeFileSync(join(runDir, name), body, "utf8");
  const writeJson = (name: string, value: unknown) => write(name, JSON.stringify(value, null, 2));

  writeJson("input.json", intake);
  copyFileSync(join(__dirname, "prompt.md"), join(runDir, "prompt.md"));

  // Stage (a) part 2 — tokens.
  let extraction: TokenExtractionResult | null = null;
  let tokens: Tokens;
  const accent = intake.E3.startsWith("#")
    ? ({ mode: "hex", hex: intake.E3 } as const)
    : ({ mode: "you-choose" } as const);

  if (opts.skipTokens) {
    // The offline path goes through the real fallback builder, so what it produces is the
    // palette a failed extraction would actually ship — not a second set of constants.
    tokens = buildFallbackTokens({ referenceUrl: intake.E1, accent, typeFeel: intake.E5 });
  } else {
    extraction = await stage("extractTokens", () =>
      extractTokens({ referenceUrl: intake.E1, accent, typeFeel: intake.E5 }),
    );
    tokens = extraction.tokens;
  }
  writeJson("tokens.json", tokens);

  // Stage (b).
  const structure = await stage("selectStructure", () => selectStructure(intake, voiceWords));
  writeJson("structure.json", structure);

  // The generation run directory: only the context files, per generate.ts's guard 2.
  const genDir = join(runDir, "generation");
  mkdirSync(genDir, { recursive: true });
  writeFileSync(join(genDir, "input.json"), JSON.stringify(intake, null, 2), "utf8");
  writeFileSync(join(genDir, "tokens.json"), JSON.stringify(tokens, null, 2), "utf8");
  writeFileSync(join(genDir, "structure.json"), JSON.stringify(structure, null, 2), "utf8");
  writeFileSync(join(genDir, "voice-words.json"), JSON.stringify(voiceWords, null, 2), "utf8");
  const exemplar = loadExemplar(structure.register.register);
  if (exemplar) writeFileSync(join(genDir, "exemplar.md"), exemplar.body, "utf8");

  // Stages (c) and (d). The deterministic tail runs *inside* the attempt so that a
  // verification-build failure is structural and counts toward the three — see the `verify`
  // hook's doc in generate.ts.
  /**
   * What the deterministic tail produced on the attempt that succeeded. Held in one object
   * rather than three `let`s so the success path has a single thing to assert on.
   */
  interface Tail {
    reconciled: ReconcileResult;
    floor: { spec: SiteSpec; report: CopyFloorReport };
  }
  // A holder rather than a bare `let`: the assignment happens inside the `verify` callback,
  // which TypeScript's control-flow analysis cannot see, so a `let` narrows to `null`.
  const tail: { current: Tail | null } = { current: null };
  let build: VerificationBuildResult = {
    ran: false,
    ok: false,
    exitCode: null,
    tail: "",
    durationMs: 0,
  };

  const generation = await stage("generate", () =>
    runGeneration({
      runDir: genDir,
      driver,
      useJsonSchema: driver.name === "claude-p",
      onDraft: (raw, attempt) => writeJson(`draft-attempt-${attempt}.json`, raw),
      verify: async (candidate): Promise<VerifyOutcome> => {
        // Deterministic, and never a retry trigger: every outcome below is semantic.
        const reconciled = reconcile(candidate, intake, structure);
        const floor = applyCopyFloor(reconciled.spec, intake);
        tail.current = { reconciled, floor };
        writeJson("linter-report.json", floor.report);

        const parsed = siteSpecSchema.safeParse(floor.spec);
        if (!parsed.success) {
          // The floor cannot normally break a spec — it only blanks strings — so this is a
          // genuine structural fault worth another attempt.
          return { ok: false, error: `after the copy floor: ${z.prettifyError(parsed.error)}` };
        }
        writeJson("spec.json", parsed.data);

        if (opts.runBuild === false) return { ok: true };

        build = await verificationBuild(
          join(runDir, "spec.json"),
          parsed.data.pages.map((p) => p.slug),
        );
        return build.ok
          ? { ok: true }
          : { ok: false, error: `verification build failed (exit ${build.exitCode}):\n${build.tail}` };
      },
    }),
  );

  const contrast = checkContrast(tokens);

  const done: Tail | null = generation.status === "ok" ? tail.current : null;

  let outcome: RunOutcome;
  if (!done) {
    outcome = "needs-attention";
  } else {
    const semanticFlags =
      contrast.flags.length +
      (extraction?.flag ? 1 : 0) +
      intakeFlags.length +
      structure.flags.length +
      done.reconciled.flags.length +
      done.floor.report.violations.length;
    outcome = semanticFlags ? "spec-ready-with-flags" : "spec-ready";
  }

  const runJson = {
    slug,
    outcome,
    driver: driver.name,
    trigger: "manual",
    startedAt: new Date().toISOString(),
    attempts: generation.attempts,
    model: generation.attempts.find((a) => a.meta)?.meta ?? null,
    timings,
    verificationBuild: build,
    intakePath: resolve(opts.intakePath),
    reason: generation.status === "failed" ? generation.reason : null,
  };
  writeJson("run.json", runJson);

  // One errors file per failed attempt, beside that attempt's draft. `generation/errors.txt`
  // is the scratch copy the *next* attempt reads and is overwritten each time, so it only
  // ever holds the last one; the run folder is the record and keeps them all.
  for (const a of generation.attempts) {
    if (a.failure) write(`errors-attempt-${a.attempt}.txt`, `${a.failure}\n`);
  }

  if (generation.status === "failed" || !done) {
    const reason =
      generation.status === "failed"
        ? generation.reason
        : "Generation reported success but the deterministic tail produced nothing — a bug in the runner, not in the input.";
    write(
      "flags.md",
      [
        `# REVIEW — ${intake.A1}`,
        "",
        "Outcome: **needs-attention**. ANALYSIS did not produce a spec.",
        "",
        "## Why",
        "",
        reason,
        "",
        "## Attempts",
        "",
        ...generation.attempts.map(
          (a) => `### Attempt ${a.attempt} — ${a.ok ? "ok" : "failed"}\n\n\`\`\`\n${a.failure ?? ""}\n\`\`\`\n`,
        ),
        "008 §4: three structural failures is a broken input, not an unlucky model. Park the client; do not re-run without changing something.",
        "",
      ].join("\n"),
    );
    notify(slug, outcome);
    const stateLine = `analysis: latest run analysis/${basename(runDir)} — needs-attention`;
    console.log(`\n${stateLine}`);
    return { outcome, runDir, slug, attempts: generation.attempts, stateLine };
  }

  const sheet = buildFlagsSheet({
    intake,
    intakeFlags,
    voiceWords,
    structure,
    extraction,
    tokens,
    contrast,
    reconciled: done.reconciled,
    floor: done.floor.report,
    spec: done.floor.spec,
    build,
    outcome,
  });
  write("flags.md", sheet);

  notify(slug, outcome);

  // `state.md` is propose-class — the portal renders it to the client, so the runner prints
  // this line and the owner pastes it. Writing it here would be the runner approving itself.
  const stateLine = `analysis: latest run analysis/${basename(runDir)} — ${outcome}`;
  console.log(`\nRun folder: ${runDir}`);
  console.log(`Outcome:    ${outcome}`);
  console.log("\nPaste into the client's state.md (propose-class — not written by this run):");
  console.log(`  ${stateLine}`);
  console.log(`  review-entered: ${new Date().toISOString()}`);

  return { outcome, runDir, slug, attempts: generation.attempts, stateLine };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1]?.replace(/\\/g, "/").includes("analysis/run")) {
  const intakePath = arg("intake");
  const clientDir = arg("client-dir");
  if (!intakePath || !clientDir) {
    console.error(
      "Usage: npx tsx src/lib/analysis/run.ts --intake <intake.json> --client-dir <dir>\n" +
        "         [--driver claude|mock] [--draft <path>] [--skip-tokens] [--no-build]",
    );
    process.exit(1);
  }

  const driverName = arg("driver") ?? "claude";
  const draftPath = arg("draft");
  if (driverName === "mock" && !draftPath) {
    console.error("--driver mock requires --draft <path to a draft-spec.json>");
    process.exit(1);
  }

  run({
    intakePath,
    clientDir,
    driver: driverName === "mock" ? mockDriver(resolve(draftPath!)) : claudeDriver,
    skipTokens: process.argv.includes("--skip-tokens"),
    runBuild: !process.argv.includes("--no-build"),
  })
    .then((r) => process.exit(r.outcome === "needs-attention" ? 1 : 0))
    .catch((err: unknown) => {
      console.error("ANALYSIS failed:", err instanceof Error ? err.stack : err);
      process.exit(1);
    });
}

export type { RunMeta };
