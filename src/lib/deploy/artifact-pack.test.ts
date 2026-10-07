import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { hashArtifact, packArtifact, unpackArtifact } from "./artifact-pack";

function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

const SITE = {
  "index.html": "<h1>Home</h1>",
  "about/index.html": "<h1>About</h1>",
  "_next/static/chunks/app.js": "console.log(1)",
  [`${"deep/".repeat(30)}x.css`]: "body{}",
};

test("same tree gives the same bytes, regardless of mtimes or write order", () => {
  const a = tree(SITE);
  const b = tree(Object.fromEntries(Object.entries(SITE).reverse()));
  fs.utimesSync(path.join(b, "index.html"), new Date(0), new Date(2020, 1, 1));
  const pa = packArtifact(a);
  const pb = packArtifact(b);
  assert.equal(pa.hash, pb.hash);
  assert.equal(pa.files, 4);
  assert.equal(pa.hash, hashArtifact(pa.bytes));
});

test("any content or name change changes the hash", () => {
  const base = packArtifact(tree(SITE)).hash;
  assert.notEqual(packArtifact(tree({ ...SITE, "index.html": "<h1>Home!</h1>" })).hash, base);
  const renamed = { ...SITE } as Record<string, string>;
  renamed["about/index2.html"] = renamed["about/index.html"];
  delete renamed["about/index.html"];
  assert.notEqual(packArtifact(tree(renamed)).hash, base);
});

test("round-trips byte for byte, and system tar reads it", () => {
  const packed = packArtifact(tree(SITE));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "unpacked-"));
  fs.rmSync(out, { recursive: true });
  assert.equal(unpackArtifact(packed.bytes, out), 4);
  for (const [rel, body] of Object.entries(SITE)) assert.equal(fs.readFileSync(path.join(out, rel), "utf8"), body);

  const listing = execFileSync("tar", ["-tzf", "-"], { input: packed.bytes }).toString().trim().split("\n").sort();
  assert.deepEqual(listing, Object.keys(SITE).sort());
});

test("carries no owner, timestamp or local path", () => {
  const dir = tree(SITE);
  const tar = zlib.gunzipSync(packArtifact(dir).bytes).toString("latin1");
  assert.ok(!tar.includes(os.userInfo().username), "no owner name");
  assert.ok(!tar.includes(dir), "no absolute build path");
  const mtime = tar.slice(136, 148);
  assert.equal(mtime, "00000000000\0");
});

test("symlinks are refused at pack time; traversal and non-files at unpack time", () => {
  const dir = tree(SITE);
  fs.symlinkSync("/etc/hosts", path.join(dir, "hosts"));
  assert.throws(() => packArtifact(dir), /symlink/);

  const evil = (name: string, type = "0") => {
    const block = Buffer.alloc(512, 0);
    block.write(name, 0);
    block.write("0000644\0", 100);
    block.write("00000000000\0", 124);
    block.write(type, 156);
    return zlib.gzipSync(Buffer.concat([block, Buffer.alloc(1024, 0)]));
  };
  const target = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "evil-")), "out");
  assert.throws(() => unpackArtifact(evil("../escape.html"), target()), /Unsafe path/);
  assert.throws(() => unpackArtifact(evil("/etc/passwd"), target()), /Unsafe path/);
  assert.throws(() => unpackArtifact(evil("link", "2"), target()), /not a regular file/);
});

test("refuses to unpack over an existing build", () => {
  const packed = packArtifact(tree(SITE));
  assert.throws(() => unpackArtifact(packed.bytes, tree({ "stale.html": "x" })), /non-empty/);
});
