import { spawn } from "node:child_process";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";
import { siteSpecSchema } from "../assembly/site-spec";
import type { Draft } from "./reconcile";

/**
 * Stage (c) — the one stage of ANALYSIS that is a model call.
 *
 * Two guards, both from `schedule-local`'s incident history, both hard:
 *
 * 1. **The prompt is never a shell string.** It is read from `prompt.md` in TypeScript and
 *    written to the child's stdin. The 2026-07-17 overnight failures were bash EOF errors
 *    from nested quotes in a heredoc; argv is no better, since a 16 KB prompt on the
 *    command line is both a quoting surface and a length limit. `spawn` with an argv array
 *    and a piped stdin has neither. There is no `--system-prompt-file` on the CLI (checked,
 *    2.1.258) — stdin is the only file-shaped delivery there is.
 *
 * 2. **The run is confined and its output is enumerated.** cwd is a scratch directory
 *    holding only the context files; the directory listing is snapshotted before and after,
 *    and the only permitted new file is `draft-spec.json`. Anything else, or nothing, is a
 *    structural failure of that attempt.
 *
 * Retries are structural only (008 §4). A semantic gap — a linter violation, an empty D1,
 * a token fallback, a contrast failure — is never retried, because retrying it is a
 * fabrication engine: the model "fixes" an empty stats section by inventing numbers.
 */

const PROMPT_FILE = join(__dirname, "prompt.md");
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

export const MAX_ATTEMPTS = 3;

export interface RunMeta {
  driver: string;
  modelId: string | null;
  sessionId: string | null;
  durationMs: number | null;
  usage: unknown;
  /** Whether `--json-schema` was passed on this run. */
  jsonSchemaUsed: boolean;
}

export interface AttemptRecord {
  attempt: number;
  ok: boolean;
  /** Structural failure reason, or null on success. */
  failure: string | null;
  meta: RunMeta | null;
}

export interface GenerationSuccess {
  status: "ok";
  draft: Draft;
  attempts: AttemptRecord[];
  meta: RunMeta;
}

export interface GenerationFailure {
  status: "failed";
  attempts: AttemptRecord[];
  /** 008 §4: three structural failures means the input is broken, not that the model was unlucky. */
  reason: string;
}

export type GenerationResult = GenerationSuccess | GenerationFailure;

/**
 * The driver seam — and it is 008 §2's API-rail swap seam, named so a later session
 * recognises it. Moving to the Messages API means writing a second `Driver`, not touching
 * anything downstream. The trigger is recorded in 008: structural retry rates above ~1 in 5,
 * or volume where subscription-window contention delays a client.
 */
export interface Driver {
  readonly name: string;
  /**
   * Run one attempt. Writes `draft-spec.json` into `runDir` and returns the run metadata.
   * Throws on invocation failure; a *structural* failure is the caller's to detect.
   */
  invoke(args: { runDir: string; prompt: string; jsonSchema: string | null }): Promise<RunMeta>;
}

// ---------------------------------------------------------------------------
// The claude -p driver
// ---------------------------------------------------------------------------

/**
 * Flags, and why each one is here:
 *
 * - `--tools Read,Write` — the model reads its context files and writes one output. Nothing
 *   else is needed and nothing else is granted.
 * - `--restricted` — removes Bash/WebFetch, confines the file tools to the working
 *   directory, and ignores user/project/local settings files. The confinement is what makes
 *   guard 2's directory snapshot meaningful rather than decorative.
 * - `--permission-mode dontAsk` — an interactive permission prompt hangs an unattended run
 *   forever. `bypassPermissions` is deliberately not used; `--restricted` refuses it anyway.
 * - `--no-session-persistence` — a generation run is not a conversation to resume.
 * - `--output-format json` — yields the model id actually used, which is what satisfies
 *   008 §7's artifact-pinning rather than a hardcoded constant.
 */
function claudeArgs(jsonSchema: string | null): string[] {
  const args = [
    "-p",
    "--tools",
    "Read,Write",
    "--restricted",
    "--permission-mode",
    "dontAsk",
    // `--tools` makes a tool *available*; it does not make it *permitted*. With `dontAsk`
    // alone the model reaches for Write and the permission layer refuses without prompting
    // — the run "succeeds", writes nothing, and reports that it needed permission. Verified
    // 2026-09-04: `dontAsk` = 1 denial and no file; `dontAsk` + this allowlist = "Done." and
    // the file on disk. `acceptEdits` also works but auto-accepts edits generally; the
    // allowlist says exactly what an unattended run may do.
    "--allowed-tools",
    "Read",
    "Write",
    "--model",
    "opus",
    "--effort",
    "high",
    "--output-format",
    "json",
    "--no-session-persistence",
  ];
  if (jsonSchema) args.push("--json-schema", jsonSchema);
  return args;
}

/**
 * The CLI could not be run, or refused the invocation itself — a bad flag, an auth failure,
 * a missing binary. Distinct from a structural failure of the model's *output*, which is
 * what 008 §4's three attempts are for. Retrying a malformed flag three times is pure waste,
 * and it hid a `--json-schema` rejection behind three identical "attempts" on the first real
 * run.
 */
export class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

export const claudeDriver: Driver = {
  name: "claude-p",

  invoke({ runDir, prompt, jsonSchema }) {
    return new Promise<RunMeta>((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, claudeArgs(jsonSchema), {
        cwd: runDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) => reject(new InvocationError(err.message)));

      child.on("close", () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(stdout);
        } catch {
          reject(
            new InvocationError(
              `claude -p returned unparseable output.\nstdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`,
            ),
          );
          return;
        }

        if (parsed.is_error) {
          reject(new InvocationError(`claude -p failed: ${String(parsed.result)}`));
          return;
        }

        const usage = parsed.usage as Record<string, unknown> | undefined;
        resolve({
          driver: "claude-p",
          modelId: Object.keys((parsed.modelUsage as object) ?? {})[0] ?? null,
          sessionId: (parsed.session_id as string) ?? null,
          durationMs: (parsed.duration_ms as number) ?? null,
          usage: usage ?? null,
          jsonSchemaUsed: jsonSchema !== null,
        });
      });

      // Guard 1. The prompt crosses the process boundary as bytes on stdin, never as argv
      // and never through a shell.
      child.stdin.write(prompt);
      child.stdin.end();
    });
  },
};

/**
 * Replays a fixed draft instead of calling the model, so Phases 3–4, the negative control
 * and every downstream test run without tokens. Same interface as the real driver, which is
 * the point — a seam only proves itself if something else already uses it.
 */
export function mockDriver(draftPath: string): Driver {
  return {
    name: "mock",
    async invoke({ runDir }) {
      copyFileSync(draftPath, join(runDir, "draft-spec.json"));
      return {
        driver: "mock",
        modelId: null,
        sessionId: null,
        durationMs: 0,
        usage: null,
        jsonSchemaUsed: false,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Guard 2 — the output contract
// ---------------------------------------------------------------------------

const OUTPUT_FILE = "draft-spec.json";

function listing(dir: string): Set<string> {
  return new Set(readdirSync(dir).filter((f) => !f.startsWith(".")));
}

/** Written by the retry loop itself between attempts, so it is part of the contract. */
const ERRORS_FILE = "errors.txt";

/**
 * The run directory, judged against the contract: it holds the context files it started
 * with, plus `draft-spec.json`, plus nothing. 008 §2: "it writes exactly one spec file and
 * one provenance record, and a write anywhere else is a failure, not a bonus."
 *
 * Two things this gets right that a previous-attempt diff does not, both found on Phase 3's
 * negative controls:
 *
 * - **Presence, not creation.** On a retry the draft is already there from the failed
 *   attempt and `errors.txt` tells the model to *fix* it, so a correct retry overwrites
 *   rather than creates. Judging creation reported every such retry as "no draft-spec.json
 *   written", turning a recoverable structural failure into an unconditional park. Never
 *   seen before now only because the one real run to date succeeded on attempt 1.
 * - **The baseline is the start of the run, not the previous attempt.** A stray file
 *   written on attempt 1 is in attempt 2's "before" set, so diffing against the previous
 *   attempt lets the same stray pass the second time. The contract holds on every attempt.
 */
function checkOutput(baseline: Set<string>, after: Set<string>): string | null {
  const stray = [...after].filter(
    (f) => !baseline.has(f) && f !== OUTPUT_FILE && f !== ERRORS_FILE,
  );
  if (stray.length) return `wrote files outside the contract: ${stray.join(", ")}`;
  return after.has(OUTPUT_FILE) ? null : `no ${OUTPUT_FILE} written`;
}

// ---------------------------------------------------------------------------
// The retry loop
// ---------------------------------------------------------------------------

/**
 * `--json-schema` for the CLI, which is `z.toJSONSchema` output **minus `$schema`**.
 *
 * Zod v4 emits `"$schema": "https://json-schema.org/draft/2020-12/schema"`, and the CLI's
 * validator rejects the whole document with *"no schema with key or ref
 * https://json-schema.org/draft/2020-12/schema"* — it does not bundle the meta-schema.
 * Verified 2026-09-04: identical schema minus that one key is accepted.
 */
export function siteSpecJsonSchema(): string {
  const schema = z.toJSONSchema(siteSpecSchema) as Record<string, unknown>;
  delete schema.$schema;
  return JSON.stringify(schema);
}

export interface GenerationOptions {
  runDir: string;
  driver: Driver;
  /**
   * Pass `z.toJSONSchema(siteSpecSchema)` to constrain decoding. Belt-and-braces only —
   * the Zod loop stays the oracle whether or not the CLI honours it.
   */
  useJsonSchema?: boolean;
  /**
   * The rest of the structural oracle, run inside the attempt.
   *
   * Zod is not the whole of it: 008 §6 makes a real `next build` the last word on whether a
   * spec is buildable, and a build failure is structural by the same argument a Zod
   * rejection is — the output is malformed, and a different draw may well be fine. Running
   * it here rather than after the loop is what lets it *count* toward the three attempts and
   * feed its error text into the next `errors.txt`, instead of parking a run that one retry
   * would have saved.
   *
   * Semantic outcomes — linter blanks, contrast, unmapped content — must NEVER be reported
   * as failures through this hook. 008 §4 is explicit that retrying them is a fabrication
   * engine.
   */
  verify?: (draft: Draft, attempt: number) => Promise<VerifyOutcome>;
  /**
   * Called with the raw parsed draft of every attempt, before Zod judges it — so a rejected
   * attempt still leaves an artifact. `verify` only ever sees drafts that already passed the
   * schema, which meant a parked run recorded three failures and not one of the drafts that
   * caused them: the folder said what was wrong and withheld the evidence.
   */
  onDraft?: (raw: unknown, attempt: number) => void;
}

export type VerifyOutcome = { ok: true } | { ok: false; error: string };

/**
 * Generate a draft, retrying **structural** failures only, three attempts total.
 *
 * A structural failure is one of: Zod rejects the draft, the output file is missing or
 * accompanied by strays, or the JSON does not parse. On each retry the previous attempt's
 * error text lands in the run directory as `errors.txt` and the prior draft is left in
 * place, so the model is fixing its own output rather than starting over.
 *
 * On the third failure this returns a failure record. No fourth attempt and no model
 * escalation — 008 §4 rules that three structural failures means the input is broken.
 */
export async function runGeneration(opts: GenerationOptions): Promise<GenerationResult> {
  const { runDir, driver } = opts;
  const prompt = readFileSync(PROMPT_FILE, "utf8");
  const jsonSchema = opts.useJsonSchema ? siteSpecJsonSchema() : null;

  const attempts: AttemptRecord[] = [];
  // Snapshotted once: the context files the run started with. Every attempt is judged
  // against this, never against the attempt before it.
  const baseline = listing(runDir);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let meta: RunMeta | null = null;
    let failure: string | null = null;
    let draft: Draft | null = null;

    try {
      meta = await driver.invoke({ runDir, prompt, jsonSchema });
      failure = checkOutput(baseline, listing(runDir));

      if (!failure) {
        const raw = readFileSync(join(runDir, OUTPUT_FILE), "utf8");
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch (err) {
          failure = `draft-spec.json is not valid JSON: ${(err as Error).message}`;
        }

        if (!failure) {
          opts.onDraft?.(parsedJson, attempt);
          // `_flags` is stripped by reconcile, so validate the spec without it.
          const { _flags, ...spec } = parsedJson as Record<string, unknown>;
          const result = siteSpecSchema.safeParse(spec);
          if (result.success) {
            const candidate = {
              ...(result.data as object),
              ...(_flags ? { _flags } : {}),
            } as Draft;
            const verdict: VerifyOutcome = opts.verify
              ? await opts.verify(candidate, attempt)
              : { ok: true };
            if (verdict.ok) draft = candidate;
            else failure = verdict.error;
          } else {
            failure = z.prettifyError(result.error);
          }
        }
      }
    } catch (err) {
      failure = (err as Error).message;
      if (err instanceof InvocationError) {
        attempts.push({ attempt, ok: false, failure, meta });
        return {
          status: "failed",
          attempts,
          reason: `Invocation failed, so no attempt reached the model. Not retried: ${failure}`,
        };
      }
    }

    attempts.push({ attempt, ok: !failure, failure, meta });

    if (!failure && draft && meta) {
      return { status: "ok", draft, attempts, meta };
    }

    if (attempt < MAX_ATTEMPTS) {
      writeFileSync(
        join(runDir, ERRORS_FILE),
        `Attempt ${attempt} failed. Fix draft-spec.json and write it again.\n\n${failure}\n`,
        "utf8",
      );
    }
  }

  return {
    status: "failed",
    attempts,
    reason:
      `${MAX_ATTEMPTS} structural failures. Per 008 §4 this is a broken input, not an ` +
      `unlucky model: park the client and record the failure. No fourth attempt.`,
  };
}
