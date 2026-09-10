/**
 * Post-deploy image prewarm — `qa-specification.md` §6.5, ported from
 * `portfolio-2026/scripts/prewarm-images.mjs`, deliberately NOT verbatim.
 *
 * The source script warms `/_next/image?url=...&w=N` — Vercel's on-demand AVIF encoder —
 * because a cold miss there costs 1–2s per image. Neither half of that exists here:
 * `next.config.ts` sets `images: { unoptimized: true }` and every section renders a plain
 * `<img src>`, so there is no on-demand encode step to warm at any width, on Cloudflare or
 * anywhere else. That resolves the "custom loader" edge `deploy/SPEC.md` flagged as
 * unresolved — the static-export decision made the loader question moot rather than
 * answering it.
 *
 * What's left to warm is Cloudflare's own edge cache: a static asset a PoP has never seen
 * pulls from the origin store on its first request, same 1–2s-class cold-start shape for a
 * different reason. This walks the site's own pages (not a sitemap — the template ships
 * none) and requests every `<img src>` it finds, once per asset, so that pull happens here
 * instead of in a visitor's browser.
 */

const CONCURRENCY = 6;

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(url, { headers: { "user-agent": "aethr-prewarm" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function imageUrls(html: string, origin: string): Set<string> {
  const found = new Set<string>();
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const src = decodeEntities(match[1]);
    if (src.startsWith("data:")) continue;
    found.add(src.startsWith("/") ? `${origin}${src}` : src);
  }
  return found;
}

interface WarmResult {
  url: string;
  ok: boolean;
  ms: number;
  bytes: number;
  cacheStatus: string;
}

async function warm(url: string, fetchImpl: typeof fetch): Promise<WarmResult> {
  const started = Date.now();
  try {
    const res = await fetchImpl(url);
    const bytes = (await res.arrayBuffer()).byteLength;
    return {
      url,
      ok: res.ok,
      ms: Date.now() - started,
      bytes,
      cacheStatus: res.headers.get("cf-cache-status") ?? "n/a",
    };
  } catch {
    return { url, ok: false, ms: Date.now() - started, bytes: 0, cacheStatus: "error" };
  }
}

async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const queue = [...items];
  const results: R[] = [];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        results.push(await worker(item));
      }
    }),
  );
  return results;
}

export interface PrewarmSummary {
  pagesVisited: number;
  imagesFound: number;
  warmed: number;
  failed: number;
  totalBytes: number;
}

/** `pagePaths` — the site's own known routes (from `spec.json`'s pages), not a sitemap crawl. */
export async function prewarmImages(
  origin: string,
  pagePaths: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<PrewarmSummary> {
  const cleanOrigin = origin.replace(/\/$/, "");
  const urls = new Set<string>();

  await pool(pagePaths, async (pagePath) => {
    try {
      const html = await fetchText(`${cleanOrigin}${pagePath}`, fetchImpl);
      for (const url of imageUrls(html, cleanOrigin)) urls.add(url);
    } catch (error) {
      console.warn(`  ! skipped ${pagePath}: ${(error as Error).message}`);
    }
  });

  if (urls.size === 0) {
    return { pagesVisited: pagePaths.length, imagesFound: 0, warmed: 0, failed: 0, totalBytes: 0 };
  }

  const results = await pool([...urls], (url) => warm(url, fetchImpl));
  const failed = results.filter((r) => !r.ok);

  return {
    pagesVisited: pagePaths.length,
    imagesFound: urls.size,
    warmed: results.length - failed.length,
    failed: failed.length,
    totalBytes: results.reduce((sum, r) => sum + r.bytes, 0),
  };
}

// CLI: npx tsx src/lib/qa/image-pipeline/prewarm.ts <origin> <page-path> [page-path...]
if (process.argv[1]?.replace(/\\/g, "/").includes("qa/image-pipeline/prewarm")) {
  const [origin, ...pagePaths] = process.argv.slice(2);
  if (!origin || pagePaths.length === 0) {
    console.error("Usage: npx tsx src/lib/qa/image-pipeline/prewarm.ts <origin> <page-path> [page-path...]");
    process.exit(1);
  }
  prewarmImages(origin, pagePaths)
    .then((summary) => {
      console.log(
        `Warmed ${summary.warmed}/${summary.imagesFound} images across ${summary.pagesVisited} pages, ` +
          `${(summary.totalBytes / 1048576).toFixed(2)} MB, ${summary.failed} failed`,
      );
      if (summary.failed > 0) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error("prewarm failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
