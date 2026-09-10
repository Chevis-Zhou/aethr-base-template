import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import type { Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import type { CheckFinding } from "./types";

const execFileAsync = promisify(execFile);

/**
 * The accessibility floor, `qa-specification.md` §4. Three parts, all blocking except
 * best-practices (advisory) and performance (recorded only, gates nothing anywhere —
 * owner ruling, §6).
 *
 * The actual `lighthouse()` call happens in `lighthouse-runner.mjs`, spawned as a plain
 * Node child process rather than called in-process here — a `tsx`-specific `__name is not
 * defined` failure inside Lighthouse's own page-injected code otherwise (see that file).
 *
 * That spawn MUST be async (`execFile`, not `execFileSync`): the target page is served by
 * an in-process static server (`static-server.ts`), and `execFileSync` blocks this
 * process's event loop until the child exits — so the server can never answer the child's
 * navigation request, and Lighthouse's `Page.navigate` fails with "Target closed" or hangs
 * to a timeout. Confirmed by elimination: the same call against an external URL (unaffected
 * by this process's event loop) succeeded every time; only same-process-server targets failed.
 *
 * The contrast check is deliberately absent — it fires at ANALYSIS against the client's
 * extracted tokens, not here. See `SPEC.md` §4.
 */

const LIGHTHOUSE_RUNNER = path.join(__dirname, "lighthouse-runner.mjs");

export interface LighthouseScores {
  accessibility: number;
  seo: number;
  bestPractices: number;
  performance: number;
}

/** `cdpPort` — the `--remote-debugging-port` of an already-running, shared Chromium instance. */
export async function runLighthouse(
  url: string,
  cdpPort: number,
): Promise<{ scores: LighthouseScores; findings: CheckFinding[] }> {
  const { stdout } = await execFileAsync("node", [LIGHTHOUSE_RUNNER, url, String(cdpPort)], { encoding: "utf-8" });
  const scores: LighthouseScores = JSON.parse(stdout);

  const findings: CheckFinding[] = [];
  if (scores.accessibility !== 100) {
    findings.push({
      severity: "blocker",
      check: "a11y-lighthouse-accessibility",
      message: `Lighthouse accessibility ${scores.accessibility}, required 100.`,
      url,
      expected: "100",
      actual: String(scores.accessibility),
    });
  }
  if (scores.seo < 95) {
    findings.push({
      severity: "blocker",
      check: "a11y-lighthouse-seo",
      message: `Lighthouse SEO ${scores.seo}, required >= 95.`,
      url,
      expected: ">=95",
      actual: String(scores.seo),
    });
  }
  if (scores.bestPractices < 90) {
    findings.push({
      severity: "advisory",
      check: "a11y-lighthouse-best-practices",
      message: `Lighthouse best-practices ${scores.bestPractices}, below the 90 advisory floor.`,
      url,
      expected: ">=90",
      actual: String(scores.bestPractices),
    });
  }
  // Performance: recorded, never gates. §6.
  findings.push({
    severity: "advisory",
    check: "a11y-lighthouse-performance-recorded",
    message: `Lighthouse performance ${scores.performance} (recorded only; no threshold, per owner ruling).`,
    url,
    actual: String(scores.performance),
  });

  return { scores, findings };
}

export async function runAxe(page: Page, url: string): Promise<CheckFinding[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

  return serious.map((v) => ({
    severity: "blocker" as const,
    check: "a11y-axe-core",
    message: `axe-core ${v.impact}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}).`,
    url,
    selector: v.nodes[0]?.target.join(" ") ?? undefined,
    expected: "zero serious/critical violations",
    actual: `${v.id}: ${v.nodes.length} node(s)`,
  }));
}
