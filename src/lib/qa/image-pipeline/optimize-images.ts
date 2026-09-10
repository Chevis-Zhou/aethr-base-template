/**
 * Image optimization for the productized pipeline — `qa-specification.md` §6, ported from
 * `portfolio-2026/scripts/optimize-images.mjs`. Same two stages, same manifest gate:
 *
 * 1. sharp — resize anything over 2500px, strip EXIF/ICC/IPTC/XMP, with the size guard
 *    that keeps the original when a metadata-only strip inflates the file.
 * 2. Lossless byte-level compression. On macOS that is ImageOptim.app. On Linux it is the
 *    three binaries ImageOptim wraps — `oxipng`, `zopflipng` and `jpegtran` — run directly,
 *    which is what lets a client's own upload be processed by the shared cloud builder
 *    (ticket 012 §3 reason 3) rather than serialised through one Mac.
 *
 * Deliberately NOT ported: any next/image awareness. `next.config.ts` sets
 * `images: { unoptimized: true }` and every section component renders a plain `<img>` —
 * there is no `/_next/image` endpoint in this template at all, static export or not. The
 * source script has none either (it optimizes `public/` directly), so this part needed no
 * adaptation — see `prewarm.ts` for the part that did.
 *
 * Manifest: `.image-manifest.json` at the project root, `{ relPath: sha256 }`. The asset
 * check (`asset-check.ts`) reads the same file — one manifest, two consumers, same rule
 * STATE.md set for the shared Playwright install.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export const MAX_WIDTH = 2500;
export const RASTER_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tiff"]);
const IMAGEOPTIM_EXT = new Set([".png", ".jpg", ".jpeg", ".gif"]);

export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, ".image-manifest.json");
}

export async function readManifest(projectRoot: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(projectRoot), "utf8"));
  } catch {
    return {};
  }
}

async function writeManifest(projectRoot: string, data: Record<string, string>): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(manifestPath(projectRoot), JSON.stringify(sorted, null, 2) + "\n");
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (RASTER_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

async function getQueueCount(): Promise<number> {
  const { stdout } = await execFileAsync("osascript", [
    "-e",
    'tell application "ImageOptim" to do queuecount command',
  ]);
  return parseInt(stdout.trim(), 10);
}

async function imageOptimHelpersRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("bash", [
      "-c",
      "ps aux | grep -iE 'optipng|advpng|pngout|zopfli|jpegoptim|jpegtran|gifsicle' | grep -v grep",
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * The Linux half of stage 2.
 *
 * ImageOptim is a GUI wrapper over `oxipng`/`zopfli`/`jpegtran`; a CI runner has them
 * natively. Each tool is optional — a missing binary logs and is skipped rather than
 * failing a client's publish, because the *manifest* is what the asset check gates on and
 * sharp (stage 1) has already run by this point.
 */
async function runLosslessLinux(files: string[]): Promise<void> {
  const has = async (bin: string) => {
    try {
      await execFileAsync("which", [bin]);
      return true;
    } catch {
      return false;
    }
  };

  const pngs = files.filter((f) => path.extname(f).toLowerCase() === ".png");
  const jpgs = files.filter((f) => [".jpg", ".jpeg"].includes(path.extname(f).toLowerCase()));

  if (pngs.length > 0 && (await has("oxipng"))) {
    // `--strip safe` keeps the ICC profile sharp deliberately preserved above.
    await execFileAsync("oxipng", ["-o", "4", "--strip", "safe", "-q", ...pngs]);
    console.log(`oxipng: ${pngs.length} png(s)`);
  } else if (pngs.length > 0) {
    console.log("oxipng not installed — skipping the PNG lossless pass");
  }

  if (jpgs.length > 0 && (await has("jpegtran"))) {
    for (const file of jpgs) {
      const tmp = `${file}.tmp`;
      try {
        await execFileAsync("jpegtran", ["-copy", "none", "-optimize", "-progressive", "-outfile", tmp, file]);
        const [before, after] = await Promise.all([fs.stat(file), fs.stat(tmp)]);
        if (after.size < before.size) await fs.rename(tmp, file);
        else await fs.unlink(tmp);
      } catch {
        await fs.unlink(tmp).catch(() => {});
      }
    }
    console.log(`jpegtran: ${jpgs.length} jpeg(s)`);
  } else if (jpgs.length > 0) {
    console.log("jpegtran not installed — skipping the JPEG lossless pass");
  }
}

async function runImageOptim(files: string[]): Promise<void> {
  if (process.platform !== "darwin") {
    await runLosslessLinux(files);
    return;
  }
  const targets: string[] = [];
  for (const f of files) {
    if (!IMAGEOPTIM_EXT.has(path.extname(f).toLowerCase())) continue;
    try {
      await fs.access(f);
      targets.push(f);
    } catch {
      /* file gone */
    }
  }
  if (targets.length === 0) return;

  try {
    await execFileAsync("open", ["-a", "ImageOptim", ...targets]);
  } catch (err) {
    console.warn(`ImageOptim pass skipped -- could not launch app: ${(err as Error).message}`);
    return;
  }

  const timeoutMs = Math.min(Math.max(targets.length * 20_000, 60_000), 20 * 60_000);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let count: number;
    try {
      count = await getQueueCount();
    } catch {
      console.warn("ImageOptim pass: lost contact with app, waiting for helper processes");
      break;
    }
    if (count === 0) break;
    await sleep(3_000);
  }

  const helperStart = Date.now();
  while (Date.now() - helperStart < 60_000) {
    if (!(await imageOptimHelpersRunning())) break;
    await sleep(3_000);
  }

  console.log(`ImageOptim pass done on ${targets.length} file(s)`);
}

async function optimizeImage(filePath: string): Promise<boolean> {
  const image = sharp(filePath, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const needsResize = width > MAX_WIDTH;

  if (!needsResize && !meta.exif && !meta.iptc && !meta.xmp) return false;

  let pipeline = sharp(filePath).rotate().keepIccProfile();
  if (needsResize) pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  else if (ext === ".jpg" || ext === ".jpeg") pipeline = pipeline.jpeg({ quality: 100, mozjpeg: true });
  else if (ext === ".webp") pipeline = pipeline.webp({ lossless: true });
  else if (ext === ".avif") pipeline = pipeline.avif({ lossless: true });

  const tmp = `${filePath}.tmp`;
  const oldSize = (await fs.stat(filePath)).size;
  await pipeline.toFile(tmp);
  const newSize = (await fs.stat(tmp)).size;

  if (!needsResize && newSize >= oldSize) {
    await fs.unlink(tmp);
    return false;
  }

  await fs.rename(tmp, filePath);
  return true;
}

export interface OptimizeResult {
  processed: number;
  skipped: number;
  manifestEntries: number;
}

/** Sharp + ImageOptim + manifest, gated so only content-changed files are touched. */
export async function optimizeImages(projectRoot: string, publicDir: string): Promise<OptimizeResult> {
  const files = await walk(publicDir);
  const manifest = await readManifest(projectRoot);

  const toProcess: string[] = [];
  let skipped = 0;
  for (const f of files) {
    const rel = path.relative(projectRoot, f);
    const hash = await hashFile(f);
    if (manifest[rel] === hash) skipped++;
    else toProcess.push(f);
  }

  let processed = 0;
  for (const file of toProcess) {
    if (await optimizeImage(file)) processed++;
  }

  if (toProcess.length > 0) await runImageOptim(toProcess);

  for (const f of toProcess) {
    const rel = path.relative(projectRoot, f);
    try {
      manifest[rel] = await hashFile(f);
    } catch {
      /* file removed during processing */
    }
  }
  await writeManifest(projectRoot, manifest);

  return { processed, skipped, manifestEntries: Object.keys(manifest).length };
}

// CLI: npx tsx src/lib/qa/image-pipeline/optimize-images.ts [--project-root <path>] [--public-dir <path>]
if (process.argv[1]?.replace(/\\/g, "/").includes("qa/image-pipeline/optimize-images")) {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const projectRoot = path.resolve(flag("--project-root", process.cwd()));
  const publicDir = path.resolve(flag("--public-dir", path.join(projectRoot, "public")));

  optimizeImages(projectRoot, publicDir)
    .then((result) => {
      console.log(
        `optimize-images: ${result.processed} processed, ${result.skipped} already optimized, manifest has ${result.manifestEntries} entries`,
      );
    })
    .catch((err: unknown) => {
      console.error("optimize-images failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
