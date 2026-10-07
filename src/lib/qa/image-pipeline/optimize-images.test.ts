import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { MAX_WIDTH, optimizeImage } from "./optimize-images";

const frame = (r: number) =>
  sharp({ create: { width: 3000, height: 400, channels: 3, background: { r, g: 40, b: 90 } } }).png().toBuffer();

async function animatedWebp(dir: string, withExif: boolean): Promise<string> {
  const file = path.join(dir, `clip-${withExif ? "exif" : "plain"}.webp`);
  let img = sharp(await Promise.all([frame(10), frame(200), frame(120)]), { join: { animated: true } });
  if (withExif) img = img.withExif({ IFD0: { Copyright: "test" } });
  await img.webp({ lossless: true, delay: [100, 100, 100], loop: 0 }).toFile(file);
  return file;
}

test("an oversized animated WebP is resized frame by frame and keeps its animation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "optimize-anim-"));
  try {
    const file = await animatedWebp(dir, false);
    assert.equal(await optimizeImage(file, { projectRoot: dir }), true);
    // Read the bytes: libvips caches decoded files by path.
    const meta = await sharp(await fs.readFile(file), { animated: true }).metadata();
    assert.equal(meta.pages, 3);
    assert.equal(meta.width, MAX_WIDTH);
    assert.equal(meta.pageHeight, Math.round((400 * MAX_WIDTH) / 3000));
    assert.deepEqual(meta.delay, [100, 100, 100]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a metadata strip on an animated WebP keeps every frame", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "optimize-anim-"));
  try {
    const file = await animatedWebp(dir, true);
    // Inside the width cap, so only the metadata path can rewrite it.
    await sharp(await fs.readFile(file), { animated: true }).resize({ width: 1200 }).withExif({ IFD0: { Copyright: "test" } }).webp({ lossless: true }).toFile(`${file}.small.webp`);
    await fs.rename(`${file}.small.webp`, file);
    await optimizeImage(file, { projectRoot: dir });
    // Read the bytes: libvips caches decoded files by path.
    const meta = await sharp(await fs.readFile(file), { animated: true }).metadata();
    assert.equal(meta.pages, 3);
    assert.equal(meta.width, 1200);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
