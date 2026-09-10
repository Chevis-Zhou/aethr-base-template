/**
 * Runs a single Lighthouse pass and prints its category scores as JSON on stdout.
 *
 * Deliberately a plain-Node child process, not called in-process from `accessibility-checks.ts`.
 * Lighthouse stringifies its own gatherer functions and injects them into the target page —
 * under `tsx`'s esbuild-based loader hook, that stringified source picks up a `__name(...)`
 * call with no matching helper defined in the browser page ("ReferenceError: __name is not
 * defined" from `_lighthouse-eval.js`, confirmed reproducible via `tsx` and absent under plain
 * `node` against the same Chromium instance). Isolating the `lighthouse()` call in an
 * unmodified Node process sidesteps the interaction rather than fighting it.
 *
 * Usage: node lighthouse-runner.mjs <url> <cdp-port>
 */
import lighthouse from "lighthouse";

const [, , url, portArg] = process.argv;
const port = Number(portArg);

if (!url || !Number.isFinite(port)) {
  console.error("Usage: node lighthouse-runner.mjs <url> <cdp-port>");
  process.exit(1);
}

const runnerResult = await lighthouse(url, { port, output: "json", logLevel: "error" });
if (!runnerResult) {
  console.error("Lighthouse produced no result.");
  process.exit(1);
}

const lhr = runnerResult.lhr;
process.stdout.write(
  JSON.stringify({
    accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
    seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
    bestPractices: Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100),
    performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
  }),
);
