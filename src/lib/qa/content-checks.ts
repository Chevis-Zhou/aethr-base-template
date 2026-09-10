import type { Page } from "playwright";
import type { SiteSpec } from "../assembly/site-spec";
import type { CheckFinding, CheckResult } from "./types";

/**
 * The eight rendered-HTML checks, `qa-specification.md` §5.1. All run against a static
 * export's actual served HTML — the surface that survives a valid `spec.json` and a clean
 * `next build` (008/009's seam) — never against `spec.json` itself, which ANALYSIS's copy
 * floor already linted.
 */

// -- shared text extraction -------------------------------------------------

/**
 * Named entities React's SSR can emit. `&amp;` is applied last so a double-encoded
 * `&amp;lt;` does not collapse into a `<` that was never in the copy.
 */
const NAMED_ENTITIES: [RegExp, string][] = [
  [/&nbsp;/g, " "],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
];

export function htmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  // Numeric entities are decoded by *form*, not by an enumerated list. The list was the
  // bug: it carried `&#39;`/`&#039;` but not `&#x27;`, which is the form React actually
  // emits for an apostrophe — so check 1 saw the raw HTML and the hydrated DOM differ on
  // every client whose copy contains one, and parked a site that was perfectly fine.
  text = text.replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, code: string) => {
    const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });

  for (const [pattern, char] of NAMED_ENTITIES) text = text.replace(pattern, char);

  return text.replace(/\s+/g, " ").trim();
}

// -- check 1: SSR-text vs hydrated-DOM-text diff -----------------------------

export async function checkSsrHydrationDiff(
  page: Page,
  url: string,
  rawHtml: string,
): Promise<CheckFinding[]> {
  // Body only, on both sides — the raw fetch is the full document (head + title included),
  // and comparing that against `document.body.innerHTML` compared a title tag against no
  // title tag on every page, not SSR content against hydrated content.
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const ssrText = htmlToText(bodyMatch?.[1] ?? rawHtml);
  const hydratedText = htmlToText(await page.evaluate(() => document.body.innerHTML));

  if (ssrText === hydratedText) return [];

  // Report the first point of divergence rather than the whole body — that's what makes
  // "the failing check names itself" true for this one.
  let i = 0;
  const minLen = Math.min(ssrText.length, hydratedText.length);
  while (i < minLen && ssrText[i] === hydratedText[i]) i++;

  return [
    {
      severity: "blocker",
      check: "content-1-ssr-hydration-diff",
      message: "Static HTML text does not match the post-hydration DOM text.",
      url,
      expected: hydratedText.slice(Math.max(0, i - 20), i + 40),
      actual: ssrText.slice(Math.max(0, i - 20), i + 40),
    },
  ];
}

// -- check 2: number-vs-DOM count ---------------------------------------------

/** Noun → the spec array whose length that noun plausibly claims. Deliberately narrow —
 * see the deviation note in `SPEC.md`: this is scoped to page title/description, the one
 * surface the resolution names, not a general prose-mining pass over every string. */
const COUNT_NOUNS: { pattern: RegExp; countOf: (section: SiteSpec["pages"][number]["sections"][number]) => number | null }[] = [
  { pattern: /\btopics?\b/i, countOf: (s) => (s.type === "services" ? s.props.services.length : null) },
  { pattern: /\bsubjects?\b/i, countOf: (s) => (s.type === "services" ? s.props.services.length : null) },
  { pattern: /\bservices?\b/i, countOf: (s) => (s.type === "services" ? s.props.services.length : null) },
  { pattern: /\bprojects?\b/i, countOf: (s) => (s.type === "portfolio" ? s.props.projects.length : null) },
  { pattern: /\btestimonials?\b|\breviews?\b/i, countOf: (s) => (s.type === "testimonials" ? s.props.testimonials.length : null) },
  { pattern: /\bcredentials?\b/i, countOf: (s) => (s.type === "credentials" ? s.props.credentials.length : null) },
  { pattern: /\bfeatures?\b/i, countOf: (s) => (s.type === "feature-list" ? s.props.features.length : null) },
  { pattern: /\bquestions?\b|\bfaqs?\b/i, countOf: (s) => (s.type === "faq" ? s.props.items.length : null) },
  { pattern: /\bplans?\b|\btiers?\b|\bpackages?\b/i, countOf: (s) => (s.type === "pricing" ? s.props.tiers.length : null) },
];

function checkCountClaim(
  text: string,
  textLabel: string,
  sections: SiteSpec["pages"][number]["sections"],
  url: string,
  /**
   * The `spec.json` path the offending text came from.
   *
   * Ticket 012 §4.2: this check stays blocking, but against a client self-edit the failure
   * has to be *locatable* — "a client who adds a fourth service now fails on a sentence
   * elsewhere that still says three". Carrying the path is what lets the editor name that
   * sentence and offer the fix inline instead of reporting a failure the client cannot find.
   */
  fieldPath?: string,
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const numberMatches = [...text.matchAll(/\b(\d{1,3})\s+([a-zA-Z][a-zA-Z-]*)/g)];

  for (const match of numberMatches) {
    const claimed = Number(match[1]);
    const noun = match[2];
    const rule = COUNT_NOUNS.find((r) => r.pattern.test(noun));
    if (!rule) continue;

    const actualCounts = sections.map(rule.countOf).filter((n): n is number => n !== null);
    if (actualCounts.length === 0) continue; // no matching list on this page — nothing to check

    if (!actualCounts.includes(claimed)) {
      findings.push({
        severity: "blocker",
        check: "content-2-number-vs-dom-count",
        message: `"${match[0]}" in ${textLabel} does not match the rendered count.`,
        url,
        selector: fieldPath,
        expected: actualCounts.join(" or "),
        actual: String(claimed),
      });
    }
  }
  return findings;
}

export function checkNumberVsDomCount(
  page: SiteSpec["pages"][number],
  renderedTitle: string,
  renderedDescription: string | null,
  url: string,
  /** Index of this page in `spec.pages`, so a finding can name a writable field path. */
  pageIndex?: number,
): CheckFinding[] {
  const base = pageIndex === undefined ? undefined : `pages[${pageIndex}]`;
  return [
    ...checkCountClaim(renderedTitle, "the page title", page.sections, url, base && `${base}.title`),
    ...(renderedDescription
      ? checkCountClaim(
          renderedDescription,
          "the page description",
          page.sections,
          url,
          base && `${base}.description`,
        )
      : []),
  ];
}

// -- check 3: placeholder scan -------------------------------------------------

const PLACEHOLDER_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Lorem", pattern: /lorem ipsum/i },
  { label: "TBD", pattern: /\bTBD\b/ },
  { label: "{{", pattern: /\{\{/ },
  { label: "undefined", pattern: /\bundefined\b/ },
  { label: "NaN", pattern: /\bNaN\b/ },
  { label: "null", pattern: /\bnull\b/ },
  { label: "[object Object]", pattern: /\[object Object]/ },
];

export function checkPlaceholderScan(rawHtml: string, url: string): CheckFinding[] {
  const text = htmlToText(rawHtml);
  const findings: CheckFinding[] = [];
  for (const { label, pattern } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        severity: "blocker",
        check: "content-3-placeholder-scan",
        message: `Placeholder token "${label}" found in shipped HTML.`,
        url,
      });
    }
  }
  return findings;
}

// -- check 4: internal links + anchors -----------------------------------------

export async function checkLinks(
  page: Page,
  url: string,
  origin: string,
  fetchImpl: typeof fetch,
): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
  const ids = new Set(await page.$$eval("[id]", (els) => els.map((e) => e.id)));

  const checked = new Set<string>();
  for (const href of hrefs) {
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    if (href.startsWith("#")) {
      const anchorId = href.slice(1);
      if (anchorId && !ids.has(anchorId)) {
        findings.push({
          severity: "blocker",
          check: "content-4-links-and-anchors",
          message: `In-page anchor "${href}" does not resolve to any element.`,
          url,
          selector: `a[href="${href}"]`,
        });
      }
      continue;
    }

    const isInternal = href.startsWith("/") || href.startsWith(origin);
    const target = href.startsWith("/") ? `${origin}${href}` : href;
    if (checked.has(target)) continue;
    checked.add(target);

    try {
      const res = await fetchImpl(target, { method: "GET" });
      if (!res.ok) {
        findings.push({
          severity: isInternal ? "blocker" : "advisory",
          check: "content-4-links-and-anchors",
          message: `Link to ${target} returned ${res.status}.`,
          url,
          expected: "200",
          actual: String(res.status),
        });
      }
    } catch (err) {
      findings.push({
        severity: isInternal ? "blocker" : "advisory",
        check: "content-4-links-and-anchors",
        message: `Link to ${target} failed to resolve: ${(err as Error).message}`,
        url,
      });
    }
  }
  return findings;
}

// -- check 5: identity verbatim --------------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

export function checkIdentityVerbatim(rawHtml: string, spec: SiteSpec, url: string): CheckFinding[] {
  const text = htmlToText(rawHtml);
  const findings: CheckFinding[] = [];

  const emailsFound = new Set(text.match(EMAIL_RE) ?? []);
  for (const email of emailsFound) {
    if (email.toLowerCase() !== spec.client.email.toLowerCase()) {
      findings.push({
        severity: "blocker",
        check: "content-5-identity-verbatim",
        message: `Email "${email}" appears in the build but does not match spec.json's client.email.`,
        url,
        expected: spec.client.email,
        actual: email,
      });
    }
  }
  if (spec.client.email && text.includes(spec.client.email) === false && emailsFound.size === 0) {
    // No email on this page at all is fine — identity leakage is the only thing this
    // check polices, not universal presence.
  }

  if (spec.client.phone) {
    const phonesFound = new Set(text.match(PHONE_RE) ?? []);
    for (const phone of phonesFound) {
      const normalize = (p: string) => p.replace(/\D/g, "").replace(/^1/, "");
      if (normalize(phone) !== normalize(spec.client.phone)) {
        findings.push({
          severity: "blocker",
          check: "content-5-identity-verbatim",
          message: `Phone "${phone}" appears in the build but does not match spec.json's client.phone.`,
          url,
          expected: spec.client.phone,
          actual: phone,
        });
      }
    }
  }

  return findings;
}

// -- check 6: no empty rendered section ------------------------------------------

export async function checkEmptySections(
  page: Page,
  spec: SiteSpec["pages"][number],
  url: string,
): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];

  for (const section of spec.sections) {
    const props = section.props as { heading?: string; headline?: string; eyebrow?: string };
    const heading = props.heading ?? props.headline;
    if (!heading) continue;

    // Each section renders inside a `<div id="{type}">` wrapper (generate.ts) — the same
    // id a single-page site's own nav/CTA anchors target, and a far more reliable handle
    // than document-order indexing once two sections can share a type.
    // section.type is a closed-enum identifier (hero, about, services, ...), never
    // user-authored text, so it's safe to interpolate directly into the selector.
    const rendered = await page
      .locator(`#${section.type}`)
      .first()
      .innerText()
      .then((t) => t.replace(/\s+/g, " ").trim())
      .catch(() => undefined);
    if (rendered === undefined) continue; // section didn't render at all — check 4/structural catches this

    const expectedMinimal = [props.eyebrow, heading].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    // Heuristic: a section whose entire visible text is just its eyebrow + heading (give or
    // take a few characters) has nothing rendering below the title.
    if (rendered === expectedMinimal || rendered.length <= expectedMinimal.length + 3) {
      findings.push({
        severity: "blocker",
        check: "content-6-empty-section",
        message: `Section "${section.type}" renders a heading with no body.`,
        url,
        selector: `#${section.type}`,
      });
    }
  }

  return findings;
}

// -- check 7: images resolve + alt ------------------------------------------------

export async function checkImages(
  page: Page,
  url: string,
  fetchImpl: typeof fetch,
  origin: string,
): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];
  const images = await page.$$eval("img", (imgs) =>
    imgs.map((img) => ({ src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") })),
  );

  for (const img of images) {
    if (img.alt === null || img.alt.trim() === "") {
      findings.push({
        severity: "blocker",
        check: "content-7-images",
        message: `<img src="${img.src}"> has no alt text.`,
        url,
        selector: `img[src="${img.src}"]`,
      });
    }
    if (!img.src) continue;
    const target = img.src.startsWith("/") ? `${origin}${img.src}` : img.src;
    try {
      const res = await fetchImpl(target);
      if (!res.ok) {
        findings.push({
          severity: "blocker",
          check: "content-7-images",
          message: `Image ${target} returned ${res.status}.`,
          url,
        });
      }
    } catch (err) {
      findings.push({
        severity: "blocker",
        check: "content-7-images",
        message: `Image ${target} failed to resolve: ${(err as Error).message}`,
        url,
      });
    }
  }
  return findings;
}

// -- check 8: title, meta description, exactly one h1 --------------------------

export async function checkTitleMetaH1(page: Page, url: string): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];
  const title = await page.title();
  const description = await page
    .locator('meta[name="description"]')
    .first()
    .getAttribute("content")
    .catch(() => null);
  const h1Count = await page.locator("h1").count();

  if (!title || title.trim().length === 0) {
    findings.push({ severity: "blocker", check: "content-8-title-meta-h1", message: "Missing <title>.", url });
  } else if (title.length > 70) {
    findings.push({
      severity: "blocker",
      check: "content-8-title-meta-h1",
      message: `<title> is ${title.length} chars, over the 70-char guideline.`,
      url,
    });
  }

  if (!description || description.trim().length === 0) {
    findings.push({
      severity: "blocker",
      check: "content-8-title-meta-h1",
      message: "Missing meta description.",
      url,
    });
  } else if (description.length > 175) {
    findings.push({
      severity: "blocker",
      check: "content-8-title-meta-h1",
      message: `Meta description is ${description.length} chars, over the 175-char guideline.`,
      url,
    });
  }

  if (h1Count !== 1) {
    findings.push({
      severity: "blocker",
      check: "content-8-title-meta-h1",
      message: `Page has ${h1Count} <h1> elements, expected exactly 1.`,
      url,
    });
  }

  // Landmark uniqueness. `layout.tsx` renders a header and a footer on every route from
  // `clientConfig`, and `header`/`footer` are also section types a spec can place inline —
  // so a spec that includes one ships the page with two, stacked and identical. Every
  // archetype skeleton did exactly this until 2026-09-06 and nothing caught it: check 8
  // asserted the <h1> count and stopped there, and a duplicated landmark is invisible to
  // every other check in the suite.
  for (const landmark of ["header", "footer"] as const) {
    const count = await page.locator(landmark).count();
    if (count > 1) {
      findings.push({
        severity: "blocker",
        check: "content-8-title-meta-h1",
        message: `Page has ${count} <${landmark}> elements, expected at most 1 — the site layout already renders one, so a "${landmark}" section in the spec duplicates it.`,
        url,
      });
    }
  }

  return findings;
}

// -- orchestrator: run all eight against one page -------------------------------

export async function runContentChecksForPage(opts: {
  page: Page;
  url: string;
  origin: string;
  rawHtml: string;
  spec: SiteSpec;
  pageSpec: SiteSpec["pages"][number];
  /** Position of `pageSpec` in `spec.pages` — see `checkNumberVsDomCount`. */
  pageIndex?: number;
  fetchImpl?: typeof fetch;
}): Promise<CheckFinding[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const title = await opts.page.title();
  const description = await opts.page
    .locator('meta[name="description"]')
    .first()
    .getAttribute("content")
    .catch(() => null);

  return [
    ...(await checkSsrHydrationDiff(opts.page, opts.url, opts.rawHtml)),
    ...checkNumberVsDomCount(opts.pageSpec, title, description, opts.url, opts.pageIndex),
    ...checkPlaceholderScan(opts.rawHtml, opts.url),
    ...(await checkLinks(opts.page, opts.url, opts.origin, fetchImpl)),
    ...checkIdentityVerbatim(opts.rawHtml, opts.spec, opts.url),
    ...(await checkEmptySections(opts.page, opts.pageSpec, opts.url)),
    ...(await checkImages(opts.page, opts.url, fetchImpl, opts.origin)),
    ...(await checkTitleMetaH1(opts.page, opts.url)),
  ];
}

export function toCheckResults(findingsByCheck: Map<string, CheckFinding[]>): CheckResult[] {
  return [...findingsByCheck.entries()].map(([check, findings]) => ({
    check,
    ok: findings.length === 0,
    findings,
  }));
}
