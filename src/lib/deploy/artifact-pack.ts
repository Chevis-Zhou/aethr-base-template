import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

/**
 * The deploy artifact a fenced build runner hands to the coordinator (ADR-0009 A3 in the portal).
 *
 * A gzipped ustar of the static export, packed so the same tree always gives the same bytes:
 * paths sorted, every mtime/uid/gid zero, one mode, no owner names, no symlinks. The artifact's
 * identity is the sha256 of those bytes; the portal stores it under that hash and the
 * coordinator refuses anything that does not hash back to it.
 *
 * Only `out/` goes in. The Worker source is deployed from the base-template commit the build
 * ran at, and `wrangler.jsonc` (contact address, routes) is written by the coordinator from what
 * the portal says — never from the runner — so nothing secret or client-identifying beyond the
 * public site itself is in here.
 */

const BLOCK = 512;
/** ustar's name+prefix split caps a path at 255 bytes; static exports never come close. */
const MAX_PATH = 255;

export interface PackedArtifact {
  bytes: Buffer;
  /** `sha256:<hex>` over `bytes`. */
  hash: string;
  files: number;
}

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing to pack a symlink: ${path.relative(base, full)}`);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

function header(name: string, size: number): Buffer {
  const block = Buffer.alloc(BLOCK, 0);
  const bytes = Buffer.from(name, "utf8");
  if (bytes.length > MAX_PATH) throw new Error(`Path too long for the artifact: ${name}`);
  let prefix = "";
  let short = name;
  if (bytes.length > 100) {
    const cut = name.lastIndexOf("/", 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`Path cannot be split for ustar: ${name}`);
    prefix = name.slice(0, cut);
    short = name.slice(cut + 1);
  }
  block.write(short, 0, 100, "utf8");
  block.write(octal(0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii");
  block.fill(" ", 148, 156);
  block.write("0", 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  block.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(octal(sum, 7) + " ", 148, "ascii");
  return block;
}

/** Packs every regular file under `dir`. Same tree → same bytes → same hash. */
export function packArtifact(dir: string): PackedArtifact {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) throw new Error(`No build output at ${root}`);
  const files = walk(root, root).sort();
  if (files.length === 0) throw new Error(`Build output at ${root} is empty`);

  const chunks: Buffer[] = [];
  for (const rel of files) {
    const data = fs.readFileSync(path.join(root, rel));
    chunks.push(header(rel, data.length), data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK, 0));
  }
  chunks.push(Buffer.alloc(BLOCK * 2, 0));
  // Node writes a zero mtime and a fixed OS byte into the gzip header, so this is stable too.
  const bytes = zlib.gzipSync(Buffer.concat(chunks), { level: 9 });
  return { bytes, hash: hashArtifact(bytes), files: files.length };
}

export function hashArtifact(bytes: Buffer): string {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Unpacks into an empty directory. Only regular files; any path that is absolute, contains
 * `..`, or would land outside `dir` is refused rather than normalized.
 */
export function unpackArtifact(bytes: Buffer, dir: string): number {
  const root = path.resolve(dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) throw new Error(`Refusing to unpack into non-empty ${root}`);
  fs.mkdirSync(root, { recursive: true });

  const tar = zlib.gunzipSync(bytes);
  let offset = 0;
  let count = 0;
  while (offset + BLOCK <= tar.length) {
    const block = tar.subarray(offset, offset + BLOCK);
    if (block.every((b) => b === 0)) break;
    const field = (start: number, length: number) => block.subarray(start, start + length).toString("utf8").split("\0")[0];
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    if (type !== "0" && type !== "") throw new Error(`Artifact entry ${name} is not a regular file`);
    if (!name || name.startsWith("/") || name.split("/").some((s) => s === ".." || s === "") || name.includes("\\")) {
      throw new Error(`Unsafe path in artifact: ${name}`);
    }
    const target = path.join(root, name);
    if (!target.startsWith(root + path.sep)) throw new Error(`Artifact path escapes the output: ${name}`);
    const start = offset + BLOCK;
    if (start + size > tar.length) throw new Error(`Artifact truncated at ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, tar.subarray(start, start + size));
    count++;
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return count;
}
