import type { Page } from "playwright";

/**
 * Bringing a page to the state a visitor actually ends up looking at, before anything in the
 * suite measures or photographs it.
 *
 * Two independent staleness sources, both found by the Phase 5 Maxematics replay:
 *
 * 1. **Scroll-triggered reveals.** The section components use `framer-motion`'s
 *    `whileInView` / `useInView` (`stats`, `testimonials`, `cta-band`). A capture taken
 *    straight after `load` catches most of the page at `opacity: 0`, offset by its enter
 *    transform — the replay's first screenshot showed an invisible hero headline and three
 *    empty sections on a site that rendered perfectly.
 * 2. **Count-up animations.** `stats.tsx` animates its figures from zero. The first settled
 *    screenshot still photographed them mid-flight, reading "11 Topics", "9+ Weekly students"
 *    and "1792 Tutoring since" against intake values of 12, 10+ and 2022 — numbers that
 *    appear nowhere in the client's record, on the artifact REVIEW is supposed to trust.
 *
 * Waiting on `document.getAnimations()` fixes (1) and not (2): framer-motion drives numeric
 * counters through `requestAnimationFrame`, which never registers a WAAPI `Animation`. So the
 * settle condition is **rendered text stability** instead — mechanism-agnostic, and it covers
 * counters, typewriters and staggered reveals alike without knowing how any of them work.
 *
 * Deliberately **not** done by emulating `prefers-reduced-motion`: that measures a different
 * site from the one most visitors get, and would stop exercising the reveal path at all.
 */

/** Longest we wait for the page to stop changing before measuring it anyway. */
const SETTLE_TIMEOUT_MS = 8000;
/** Consecutive identical samples required to call it settled. */
const STABLE_SAMPLES = 3;
const SAMPLE_INTERVAL_MS = 150;

export async function settlePage(page: Page): Promise<void> {
  const viewportHeight = page.viewportSize()?.height ?? 1000;
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);

  // Walk the page so every IntersectionObserver fires for real. The observers in use are
  // `once: true`, so nothing re-hides on the way back up.
  for (let y = 0; y < pageHeight; y += Math.floor(viewportHeight * 0.8)) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Then wait for the rendered text to stop moving. Bounded: a site with a permanent
  // looping animation (a marquee, a rotating strapline) must not hang the suite — it
  // measures late instead, which is the same thing a reviewer would see.
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let previous = "";
  let stable = 0;

  while (Date.now() < deadline && stable < STABLE_SAMPLES) {
    const current = await page.evaluate(() => document.body.innerText);
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
  }
}
