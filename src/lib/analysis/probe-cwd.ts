import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The CLAUDE.md-contamination probe.
 *
 * A cwd under `Vault/Business/clients/` auto-loads `Vault/CLAUDE.md` plus `Business/CLAUDE.md`
 * — tens of thousands of tokens of operator rules, the caveman reporting register, routing
 * tables — into the generation session. None of it is about writing a client's website copy,
 * and some of it (the register in particular) would actively deform the output.
 *
 * This probe answers, with evidence rather than assumption: what does a headless run with
 * the real flags actually inherit, from which cwd, and which flag suppresses it?
 *
 *   npx tsx src/lib/analysis/probe-cwd.ts
 *
 * It runs the same flag set `generate.ts` uses, on a cheap model, from three cwds and with
 * three suppressor variants, and prints a table. Cheap model because CLAUDE.md discovery is
 * not model-dependent — only the flags are.
 *
 * **Run 2026-09-04 on CLI 2.1.258. The answer is `--restricted`, and it needs no help.**
 * With it, none of the five discoverable files load from any cwd — including one under
 * `Vault/Business/clients/`. Without it, from that same cwd, all five load: user CLAUDE.md,
 * the SSD and Vault and Business CLAUDE.md files, and `MEMORY.md`. No cwd choice and no
 * `--setting-sources` is required. Re-run only when the CLI version changes.
 */

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const MODEL = process.env.PROBE_MODEL ?? "haiku";

/**
 * Canary strings, one per CLAUDE.md layer that could leak in. Asking the model to *inventory*
 * its context does not work — the first probe run had every variant answer "NONE" while
 * reporting between 0 and 28,000 characters of supplied content, which is a model guessing.
 * A yes/no test against exact strings it could not invent is answerable from what is
 * actually in front of it.
 */
const CANARIES: { key: string; phrase: string; source: string }[] = [
  { key: "VAULT", phrase: "Chevis's archive and project storage", source: "Vault/CLAUDE.md" },
  { key: "BUSINESS", phrase: "AethrDesign local-first business OS", source: "Business/CLAUDE.md" },
  { key: "USER", phrase: "caveman", source: "~/.claude/CLAUDE.md (user level)" },
];

const PROMPT = [
  "Answer from your own context only. Do NOT use any tool to read files, and do not search",
  "the filesystem — I am asking what was already given to you before this message.",
  "For each key below, answer YES if that exact phrase appears anywhere in the instructions,",
  "memory, or context supplied to you before this message, and NO if it does not.",
  ...CANARIES.map((c) => `${c.key}: "${c.phrase}"`),
  "Write your answers to a file named probe.txt in your working directory, one per line, in",
  "the form KEY=YES or KEY=NO. Then one final line FILES= listing the paths of any context",
  "files you were given, comma-separated, or FILES=none. Create no other file.",
].join(" ");

interface Variant {
  label: string;
  cwd: string;
  extraArgs: string[];
  /** Only the negative control sets this. */
  noRestricted?: boolean;
}

const VAULT_CWD = "/Volumes/External SSD/Vault/Business/clients/_probe-cwd";
const REPO_CWD = join(process.cwd(), ".probe-cwd");
const TMP_CWD = join(tmpdir(), "aethr-probe-cwd");

/**
 * Three cwds and three suppressors. The suppressors are the levers the CLI actually offers:
 * `--restricted` already ignores user/project/local *settings*, which is not the same thing
 * as CLAUDE.md discovery; `--setting-sources ""` narrows further; `--system-prompt` replaces
 * the default prompt outright, which is the blunt instrument if the first two leak.
 */
const VARIANTS: Variant[] = [
  { label: "vault/clients, base flags", cwd: VAULT_CWD, extraArgs: [] },
  { label: "vault/clients, --setting-sources ''", cwd: VAULT_CWD, extraArgs: ["--setting-sources", ""] },
  {
    label: "vault/clients, --system-prompt replaced",
    cwd: VAULT_CWD,
    extraArgs: ["--system-prompt", "You write JSON files. Follow the user message exactly."],
  },
  { label: "repo dir, base flags", cwd: REPO_CWD, extraArgs: [] },
  { label: "/tmp, base flags", cwd: TMP_CWD, extraArgs: [] },
  { label: "/tmp, --setting-sources ''", cwd: TMP_CWD, extraArgs: ["--setting-sources", ""] },
  /**
   * The negative control, and the reason this probe can be believed. Every restricted
   * variant answers NO to all three canaries — which is indistinguishable from a broken
   * probe unless something proves the canaries CAN be detected. Drop `--restricted` from a
   * cwd under Vault and all three come back YES.
   */
  { label: "NEGATIVE CONTROL — vault/clients, no --restricted (expect YES/YES/YES)", cwd: VAULT_CWD, extraArgs: [], noRestricted: true },
];

/** The flags `generate.ts` uses, minus the model and the output contract. */
function baseArgs(noRestricted = false): string[] {
  return [
    "-p",
    "--tools",
    "Read,Write",
    ...(noRestricted ? [] : ["--restricted"]),
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
    MODEL,
    "--output-format",
    "json",
    "--no-session-persistence",
  ];
}

function run(variant: Variant): Promise<{ label: string; result: string; files: string[] }> {
  rmSync(variant.cwd, { recursive: true, force: true });
  mkdirSync(variant.cwd, { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, [...baseArgs(variant.noRestricted), ...variant.extraArgs], {
      cwd: variant.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) =>
      resolve({ label: variant.label, result: `spawn failed: ${err.message}`, files: [] }),
    );

    child.on("close", () => {
      const probeFile = join(variant.cwd, "probe.txt");
      const body = existsSync(probeFile) ? readFileSync(probeFile, "utf8").trim() : "(no probe.txt)";
      let note = body;
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) note = `ERROR: ${String(parsed.result)}`;
        // A denied Write looks exactly like a model that chose not to answer, so name it.
        const denials = (parsed.permission_denials ?? []) as { tool_name: string }[];
        if (denials.length && !existsSync(probeFile)) {
          note = `DENIED (${denials.map((d) => d.tool_name).join(", ")}): ${String(parsed.result).slice(0, 160)}`;
        }
      } catch {
        if (stderr.trim()) note = `stderr: ${stderr.trim().slice(0, 200)}`;
      }
      resolve({
        label: variant.label,
        result: note,
        files: existsSync(variant.cwd) ? readdirSync(variant.cwd) : [],
      });
    });

    child.stdin.write(PROMPT);
    child.stdin.end();
  });
}

async function main(): Promise<void> {
  console.log(`probe: ${CLAUDE_BIN}, model ${MODEL}\n`);

  for (const variant of VARIANTS) {
    const { label, result, files } = await run(variant);
    console.log(`=== ${label}`);
    console.log(`    cwd:   ${variant.cwd}`);
    console.log(`    files: ${files.join(", ") || "(none)"}`);
    console.log(
      result
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
    console.log();
    rmSync(variant.cwd, { recursive: true, force: true });
  }

  console.log("Record the finding in STATE.md. The next person must not have to re-probe.");
}

void main();
