import * as fs from "node:fs";
import * as path from "node:path";
import { advisories, blockers, verdictOf, type QASuiteResult } from "./types";

/** The report, `qa-specification.md` §9. Verdict line first, then blockers as
 * expected-vs-actual, advisories collapsed below, screenshots at the bottom. */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function writeQaReport(result: QASuiteResult, screenshots: string[], outDir: string): { html: string; json: string } {
  fs.mkdirSync(outDir, { recursive: true });

  const verdict = verdictOf(result);
  const blockerList = blockers(result);
  const advisoryList = advisories(result);

  const verdictLine =
    verdict === "PARKED"
      ? `PARKED — ${blockerList.length} blocker${blockerList.length === 1 ? "" : "s"}`
      : verdict === "STAGED"
        ? `STAGED — ${advisoryList.length} advisor${advisoryList.length === 1 ? "y" : "ies"}`
        : "PASS";

  const blockerRows = blockerList
    .map(
      (f) => `<tr>
        <td>${escapeHtml(f.check)}</td>
        <td>${escapeHtml(f.message)}</td>
        <td>${escapeHtml(f.url ?? "")}</td>
        <td>${escapeHtml(f.selector ?? "")}</td>
        <td>${escapeHtml(f.expected ?? "")}</td>
        <td>${escapeHtml(f.actual ?? "")}</td>
      </tr>`,
    )
    .join("\n");

  const advisoryRows = advisoryList
    .map((f) => `<li><strong>${escapeHtml(f.check)}</strong> — ${escapeHtml(f.message)} ${f.url ? `(${escapeHtml(f.url)})` : ""}</li>`)
    .join("\n");

  const screenshotImgs = screenshots
    .map((p) => `<figure><img src="${escapeHtml(path.relative(outDir, p))}" alt="${escapeHtml(path.basename(p))}"><figcaption>${escapeHtml(path.basename(p))}</figcaption></figure>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QA report — ${escapeHtml(result.slug)}</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .verdict-PARKED { color: #b91c1c; }
  .verdict-STAGED { color: #b45309; }
  .verdict-PASS { color: #15803d; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.85rem; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; }
  figure { display: inline-block; margin: 0.5rem; }
  figure img { max-width: 300px; border: 1px solid #ddd; }
  figcaption { font-size: 0.75rem; color: #666; }
</style>
</head>
<body>
<h1 class="verdict-${verdict}">${escapeHtml(verdictLine)}</h1>
<p>${escapeHtml(result.slug)} — ${escapeHtml(result.target)} — ${escapeHtml(result.ranAt)}</p>

<h2>Blockers (${blockerList.length})</h2>
<table>
<thead><tr><th>Check</th><th>Message</th><th>URL</th><th>Selector</th><th>Expected</th><th>Actual</th></tr></thead>
<tbody>
${blockerRows || '<tr><td colspan="6">None</td></tr>'}
</tbody>
</table>

<h2>Advisories (${advisoryList.length})</h2>
<ul>
${advisoryRows || "<li>None</li>"}
</ul>

<h2>Screenshots</h2>
${screenshotImgs || "<p>None captured.</p>"}
</body>
</html>
`;

  const json = JSON.stringify(
    {
      slug: result.slug,
      target: result.target,
      ranAt: result.ranAt,
      verdict,
      blockerCount: blockerList.length,
      advisoryCount: advisoryList.length,
      results: result.results,
    },
    null,
    2,
  );

  fs.writeFileSync(path.join(outDir, "qa-report.html"), html);
  fs.writeFileSync(path.join(outDir, "qa.json"), json);

  return { html: path.join(outDir, "qa-report.html"), json: path.join(outDir, "qa.json") };
}
