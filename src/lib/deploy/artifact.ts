import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The artifact manifest — what makes "DEPLOY ships what the client approved" checkable
 * rather than merely intended.
 *
 * The deploy spec (§6.1) states the property plainly: *the same deployment serves the
 * preview hostname and the production hostname; DEPLOY does not rebuild; what the client
 * signed off on is what ships, byte for byte.* It also names the precedent where that
 * failed — Maxematics' `deploy-live.sh` rewrote `noindex` → `index`, deleted pages and
 * added files *after* the last thing anyone looked at, so staging and live were built from
 * one source and were not the same bytes.
 *
 * An intention cannot catch that; a hash can. STAGING records a manifest of `out/`, DEPLOY
 * recomputes it and refuses to attach a client's apex to anything that has drifted.
 */

export interface ArtifactManifest {
  slug: string;
  /** ISO timestamp of the STAGING build this manifest describes. */
  builtAt: string;
  fileCount: number;
  totalBytes: number;
  /** sha256 over the sorted `path\0sha256` list — order-independent, rename-sensitive. */
  treeHash: string;
  files: Record<string, string>;
}

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function computeManifest(outDir: string, slug: string): ArtifactManifest {
  const resolved = path.resolve(outDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No build output at ${resolved} — run the build before staging.`);
  }

  // Sorted so the tree hash is stable across filesystems that walk in different orders.
  const relPaths = walk(resolved).sort();
  const files: Record<string, string> = {};
  let totalBytes = 0;

  for (const rel of relPaths) {
    const buf = fs.readFileSync(path.join(resolved, rel));
    files[rel] = sha256(buf);
    totalBytes += buf.byteLength;
  }

  return {
    slug,
    builtAt: new Date().toISOString(),
    fileCount: relPaths.length,
    totalBytes,
    treeHash: sha256(relPaths.map((p) => `${p}\0${files[p]}`).join("\n")),
    files,
  };
}

export interface DriftReport {
  matches: boolean;
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffManifest(approved: ArtifactManifest, current: ArtifactManifest): DriftReport {
  const approvedPaths = new Set(Object.keys(approved.files));
  const currentPaths = new Set(Object.keys(current.files));

  const added = [...currentPaths].filter((p) => !approvedPaths.has(p)).sort();
  const removed = [...approvedPaths].filter((p) => !currentPaths.has(p)).sort();
  const changed = [...currentPaths]
    .filter((p) => approvedPaths.has(p) && approved.files[p] !== current.files[p])
    .sort();

  return {
    matches: approved.treeHash === current.treeHash,
    added,
    removed,
    changed,
  };
}

export function formatDrift(report: DriftReport, limit = 10): string {
  const section = (label: string, items: string[]) =>
    items.length
      ? `  ${label} (${items.length}):\n` +
        items
          .slice(0, limit)
          .map((p) => `    ${p}`)
          .join("\n") +
        (items.length > limit ? `\n    …and ${items.length - limit} more` : "")
      : "";

  return [
    section("changed", report.changed),
    section("added", report.added),
    section("removed", report.removed),
  ]
    .filter(Boolean)
    .join("\n");
}
