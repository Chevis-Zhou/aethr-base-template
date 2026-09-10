import type { Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CheckFinding } from "./types";
import { settlePage } from "./settle";

/**
 * Layout assertions and screenshots, `qa-specification.md` §5.2.
 *
 * Four widths: 390 / 768 / 1440 / 1920. 1440 is the review width (within noise of the
 * owner's 1504×846 logical display); 1920 stays in precisely because that display is
 * smaller than it, so an unconstrained `max-width` breaking above 1536px is invisible on
 * the machine that built the site.
 *
 * The assertions block; the screenshots are advisory evidence attached to the report —
 * nobody reviews a screenshot under the ~2 hr budget, so only a mechanical check gates.
 *
 * **Both run against the settled page, never the freshly-loaded one.** The section
 * components reveal on scroll (`framer-motion` `whileInView` / `useInView` in `stats`,
 * `testimonials` and `cta-band`), so a capture taken straight after `load` catches most of
 * the page at `opacity: 0` and offset by its enter transform. The Phase 5 replay produced a
 * screenshot showing an invisible hero headline and three empty sections on a site that was
 * rendering perfectly — the artifact REVIEW is meant to look at, lying about the build. The
 * same staleness silently weakened every assertion here, because `getBoundingClientRect()`
 * on an element still translated by its enter offset is not the geometry that ships.
 */

export const LAYOUT_WIDTHS = [390, 768, 1440, 1920] as const;
const VIEWPORT_HEIGHT = 1000;

interface InPageLayoutResult {
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  widerThanViewport: string[];
  clippedText: string[];
  overlappingInteractive: [string, string][];
}

/**
 * A top-level, module-scope named function — never nested inside the `page.evaluate`
 * callback itself. `tsx`'s esbuild loader wraps functions inside that callback (const-arrow
 * or nested `function` declarations alike) in a `__name(fn, "name")` call for keep-names
 * support; that wrapper has no meaning once the callback is stringified and run inside the
 * browser ("ReferenceError: __name is not defined" — reproduced with both styles). Only a
 * function declared at this level, reconstructed via `new Function` from its own source
 * rather than passed through Playwright's normal closure serialization, avoids it.
 */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : "";
  return `${tag}${id}${cls}`;
}

async function evaluateLayout(page: Page, viewportWidth: number): Promise<InPageLayoutResult> {
  return page.evaluate(
    ({ viewportWidth, describeElementSrc }) => {
      const describe = new Function(`return (${describeElementSrc})`)() as (el: Element) => string;

      const doc = document.documentElement;
      const horizontalOverflow = doc.scrollWidth > window.innerWidth + 1;

      const widerThanViewport: string[] = [];
      const allEls = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const el of allEls) {
        if (el.scrollWidth > viewportWidth + 2) {
          const style = getComputedStyle(el);
          if (style.overflowX === "hidden" || style.overflowX === "scroll" || style.overflowX === "auto") continue;
          widerThanViewport.push(describe(el));
          if (widerThanViewport.length >= 20) break;
        }
      }

      const clippedText: string[] = [];
      for (const el of allEls) {
        const style = getComputedStyle(el);
        const hasOwnText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
        );
        if (!hasOwnText) continue;
        if (style.overflow !== "hidden" && style.overflowY !== "hidden") continue;
        if (style.textOverflow === "ellipsis") continue; // intentional truncation, not clipping
        // The standard visually-hidden-but-accessible pattern (Tailwind's `sr-only`: absolute
        // position, 1x1px box, clipped) is indistinguishable from real clipping by box
        // dimensions alone — it's deliberately a 1px box hiding real text. Recognize it by
        // its own signature rather than by class name, so a non-Tailwind equivalent is
        // caught too.
        const isVisuallyHiddenA11yPattern =
          style.position === "absolute" && parseFloat(style.width) <= 1 && parseFloat(style.height) <= 1;
        if (isVisuallyHiddenA11yPattern) continue;
        if (el.scrollHeight > el.clientHeight + 2) {
          clippedText.push(describe(el));
          if (clippedText.length >= 20) break;
        }
      }

      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [role='button']"),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      const overlapping: [string, string][] = [];
      for (let i = 0; i < interactive.length; i++) {
        for (let j = i + 1; j < interactive.length; j++) {
          const a = interactive[i];
          const b = interactive[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const overlapX = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
          const overlapY = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
          const overlapArea = overlapX * overlapY;
          const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
          if (minArea > 0 && overlapArea / minArea > 0.3) {
            overlapping.push([describe(a), describe(b)]);
            if (overlapping.length >= 20) break;
          }
        }
        if (overlapping.length >= 20) break;
      }

      return {
        horizontalOverflow,
        scrollWidth: doc.scrollWidth,
        clientWidth: window.innerWidth,
        widerThanViewport,
        clippedText,
        overlappingInteractive: overlapping,
      };
    },
    { viewportWidth, describeElementSrc: describeElement.toString() },
  );
}

export async function runLayoutChecksForPage(opts: {
  page: Page;
  url: string;
  slug: string;
  screenshotDir: string;
}): Promise<{ findings: CheckFinding[]; screenshots: string[] }> {
  const findings: CheckFinding[] = [];
  const screenshots: string[] = [];
  fs.mkdirSync(opts.screenshotDir, { recursive: true });

  for (const width of LAYOUT_WIDTHS) {
    await opts.page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await opts.page.goto(opts.url, { waitUntil: "load" });
    await settlePage(opts.page);

    const result = await evaluateLayout(opts.page, width);

    if (result.horizontalOverflow) {
      findings.push({
        severity: "blocker",
        check: "layout-overflow",
        message: `Horizontal overflow at ${width}px (scrollWidth ${result.scrollWidth} > viewport ${result.clientWidth}).`,
        url: opts.url,
      });
    }
    for (const selector of result.widerThanViewport) {
      findings.push({
        severity: "blocker",
        check: "layout-wider-than-viewport",
        message: `Element wider than the ${width}px viewport.`,
        url: opts.url,
        selector,
      });
    }
    for (const selector of result.clippedText) {
      findings.push({
        severity: "blocker",
        check: "layout-clipped-text",
        message: `Text clipped at ${width}px.`,
        url: opts.url,
        selector,
      });
    }
    for (const [a, b] of result.overlappingInteractive) {
      findings.push({
        severity: "blocker",
        check: "layout-overlapping-interactive",
        message: `Interactive elements overlap at ${width}px: ${a} / ${b}.`,
        url: opts.url,
        selector: `${a}, ${b}`,
      });
    }

    const shotPath = path.join(opts.screenshotDir, `${opts.slug.replace(/\//g, "_") || "index"}-${width}.png`);
    await opts.page.screenshot({ path: shotPath, fullPage: true });
    screenshots.push(shotPath);
  }

  return { findings, screenshots };
}
