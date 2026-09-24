import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { diffContent, templateDelta } from "../src/lib/change/annotated";
import {
  advance,
  assertStage,
  carrierOf,
  diffSpecs,
  openPassDir,
  PASS_FILES,
  renderDelta,
  stateProposal,
  writePass,
  type PassStage,
  type PassState,
} from "../src/lib/change/pass";

/**
 * Ticket 026's pass ordering and the REVIEW delta, checked without a build.
 *
 *   npx tsx scripts/check-change-pass.ts
 */

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
}
function throws(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const spec = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/lib/assembly/sample-specs/service-business.json"), "utf-8"),
);

const base: PassState = {
  slug: "probe",
  passId: "p1",
  paymentRef: "cs_test_1",
  klass: "minor",
  quantity: 1,
  contactEmail: "a@b.c",
  domain: "probe.com",
  openedAt: "2026-09-11T00:00:00.000Z",
  baseVersion: 3,
  stage: "REVIEW",
  log: [],
};
const at = (stage: PassStage, extra: Partial<PassState> = {}): PassState => ({ ...base, stage, ...extra });

// ── ordering ──────────────────────────────────────────────────────────────────
check("build refused at REVIEW", throws(() => assertStage(at("REVIEW"), "build")));
check("stage refused at QA (QA not passed)", throws(() => assertStage(at("QA"), "stage")));
check("deploy refused at APPROVE (client gate)", throws(() => assertStage(at("APPROVE"), "deploy")));
check("approve refused at STAGING", throws(() => assertStage(at("STAGING"), "approve")));
check("rebuild allowed at QA", !throws(() => assertStage(at("QA"), "build")));
check("re-review allowed at STAGING", !throws(() => assertStage(at("STAGING"), "review")));
check("re-review refused at APPROVE (preview already sent)", throws(() => assertStage(at("APPROVE"), "review")));
check("close refused before seed", throws(() => assertStage(at("DEPLOY", { deployedAt: "x" }), "close")));
check("close allowed after seed", !throws(() => assertStage(at("DEPLOY", { seededVersion: 5 }), "close")));
const advanced = advance(base, "BUILD", "REVIEW approved");
check("advance appends a log row", advanced.log.length === 1 && advanced.stage === "BUILD");

// ── delta / partition ─────────────────────────────────────────────────────────
check("identical specs → empty delta", diffSpecs(spec, structuredClone(spec)).length === 0);

const headline = structuredClone(spec);
headline.pages[0].sections[0].props.headline = "New headline";
const h = diffSpecs(spec, headline);
check(
  "headline edit is one free path",
  h.length === 1 && h[0].path === "pages[0].sections[0].props.headline" && h[0].free,
  JSON.stringify(h),
);

const href = structuredClone(spec);
href.pages[0].sections[0].props.ctaHref = "/book";
const l = diffSpecs(spec, href);
check("ctaHref edit is paid", l.length === 1 && !l[0].free, JSON.stringify(l));

const added = structuredClone(spec);
added.pages[0].sections.push({ type: "faq", props: { heading: "FAQ", items: [{ question: "q", answer: "a" }] } });
const a = diffSpecs(spec, added);
check(
  "adding a section is one paid membership change",
  a.length === 1 && a[0].change === "membership" && a[0].path === "pages[0].sections" && !a[0].free,
  JSON.stringify(a),
);

const reordered = structuredClone(spec);
[reordered.pages[0].sections[1], reordered.pages[0].sections[2]] = [
  reordered.pages[0].sections[2],
  reordered.pages[0].sections[1],
];
const r = diffSpecs(spec, reordered);
check(
  "reorder is two paid section replacements, no free noise",
  r.length === 2 && r.every((d) => !d.free && /^pages\[0\]\.sections\[[12]\]$/.test(d.path)),
  JSON.stringify(r),
);

const token = structuredClone(spec);
token.tokens[Object.keys(token.tokens)[0]] = "#000000";
check("design token edit is paid", diffSpecs(spec, token).every((d) => !d.free));

// ── delta sheet flags ─────────────────────────────────────────────────────────
const freeOnly = renderDelta(base, h, null);
check("free-only delta is flagged", /No paid path changed/.test(freeOnly));
const structuralMinor = renderDelta(base, a, null);
check("structural change on a minor ticket is flagged", /Structural change on a minor ticket/.test(structuralMinor));
const draftSheet = renderDelta(base, l, { requests: [], dirtyDraft: { baseVersion: 3, updatedAt: "t", delta: h } });
check("dirty draft is flagged", /unpublished draft/.test(draftSheet));

// ── the annotated carrier, ticket 031 ─────────────────────────────────────────
check("a pass with no carrier field is assembled", carrierOf(base) === "spec");
check("carrier is read off the pass", carrierOf({ ...base, carrier: "annotated" }) === "annotated");
check(
  "close refused on a pass that neither seeded nor rehearsed",
  throws(() => assertStage(at("DEPLOY", { deployedAt: "x" }), "close")),
);
check(
  "close allowed on a rehearsed pass (031 §3)",
  !throws(() => assertStage(at("DEPLOY", { rehearsedAt: "2026-09-11T00:00:00Z" }), "close")),
);

const content = { hero: { title: "Maxematics", blurb: "Tutoring" }, max: { portrait: { alt: "Max Schwarzkopf" } } };
const edited = structuredClone(content);
edited.max.portrait.alt = "Max Schwarzkopf, private tutor";
const contentDelta = diffContent(content, edited);
check(
  "an annotated content edit is one free leaf",
  contentDelta.length === 1 && contentDelta[0].free && contentDelta[0].path === "max.portrait.alt",
  JSON.stringify(contentDelta),
);
check("identical content → empty delta", diffContent(content, structuredClone(content)).length === 0);
check(
  "annotated list membership reports once, at the array",
  diffContent({ faq: [1, 2] }, { faq: [1, 2, 3] }).length === 1,
);
check("an unchanged template contributes nothing", templateDelta("<p>a</p>", "<p>a</p>").length === 0);
const markup = templateDelta("<p>a</p>", "<section>a</section>");
check("a template edit is the paid side of the annotated carrier", markup.length === 1 && !markup[0].free);
check(
  "an annotated pass with only content edits reads as free-only",
  /No paid path changed/.test(renderDelta({ ...base, carrier: "annotated" }, contentDelta, null)),
);

// ── state.md proposal ─────────────────────────────────────────────────────────
const proposal = stateProposal(
  { stage: "DEPLOY", relationship: "dormant" },
  { stage: "REVIEW", relationship: "active" },
  "change pass opened",
);
check(
  "proposal diffs relationship and prints a Stage Log row",
  /\+ relationship: "active"/.test(proposal) && /\| DEPLOY \| REVIEW \| change-runner \|/.test(proposal),
  proposal,
);

// ── one open pass per client ──────────────────────────────────────────────────
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "change-pass-"));
const passes = path.join(vault, "Business/clients/probe/changes");
for (const [name, stage] of [
  ["2026-09-01T00-00-00Z", "CLOSED"],
  ["2026-09-02T00-00-00Z", "QA"],
] as const) {
  fs.mkdirSync(path.join(passes, name), { recursive: true });
  writePass(path.join(passes, name), at(stage));
}
check("openPassDir finds the one open pass", openPassDir("probe", vault)?.endsWith("2026-09-02T00-00-00Z") === true);
fs.mkdirSync(path.join(passes, "2026-09-03T00-00-00Z"));
writePass(path.join(passes, "2026-09-03T00-00-00Z"), at("REVIEW"));
check("two open passes are refused", throws(() => openPassDir("probe", vault)));
check("pass.json is the state file", fs.existsSync(path.join(passes, "2026-09-03T00-00-00Z", PASS_FILES.state)));
fs.rmSync(vault, { recursive: true, force: true });

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
