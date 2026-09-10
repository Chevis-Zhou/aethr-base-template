import { z } from "zod/v4";
import { siteSpecSchema, type SiteSpec } from "../assembly/site-spec";
import { isFreePath, RICHTEXT_LEAVES } from "./spec-adapter";
import { sanitizeRichText } from "../rich-text";
import { getAtPath, parsePath, setAtPath } from "./inventory";

/**
 * The write path, and the server-side half of the partition.
 *
 * The editor only renders free paths, but a POST is a POST. Every operation below is
 * re-checked against `isFreePath` here, so the boundary holds against a hand-rolled
 * request — which matters more than usual, because this boundary is also the price list.
 *
 * Nothing is written in place: each operation clones, applies, and re-parses the whole
 * document against `siteSpecSchema`. That is cheap on a document this size and it means an
 * edit that would produce a spec `assemble.ts` cannot build is rejected in the editor,
 * where the client can see it, rather than at the gate five minutes later.
 */

export type EditOp =
  | { op: "set"; path: string; value: string }
  | { op: "list-add"; path: string }
  | { op: "list-remove"; path: string; index: number };

export interface ApplyFailure {
  /** `forbidden` is a partition violation; the rest are shape or floor errors. */
  reason: "forbidden" | "missing" | "floor" | "alt-required" | "invalid";
  message: string;
  path: string;
}

export type ApplyResult =
  | { ok: true; spec: SiteSpec }
  | { ok: false; failure: ApplyFailure };

/** One entry per line in the control, `string[]` in the document. */
const STRING_LISTS = new Set(["tags", "keywords", "includes"]);

function fail(
  reason: ApplyFailure["reason"],
  path: string,
  message: string,
): { ok: false; failure: ApplyFailure } {
  return { ok: false, failure: { reason, message, path } };
}

/**
 * §1.3 — an upload cannot be saved while the field that becomes its `alt` is blank. Kept
 * here rather than only in the control: it is the source-side prevention for QA check 7,
 * and a check that only exists in the UI is not prevention.
 */
const ALT_SIBLING: Record<string, string> = {
  founderImage: "founderName",
  image: "title",
  avatar: "author",
  logo: "name",
};

function altBlocker(spec: unknown, path: string, value: string): string | null {
  if (value === "") return null;
  const tokens = parsePath(path);
  const leaf = tokens[tokens.length - 1];
  if (typeof leaf !== "string") return null;
  const sibling = ALT_SIBLING[leaf];
  if (!sibling) return null;

  const parent = tokens.slice(0, -1);
  const altPath = [...parent, sibling];
  const alt = getAtPath(spec, altPath.map((t) => (typeof t === "number" ? `[${t}]` : t)).join("."));
  return String(alt ?? "").trim() === "" ? sibling : null;
}

export function applyEdit(current: SiteSpec, edit: EditOp): ApplyResult {
  const next = structuredClone(current) as SiteSpec;

  if (edit.op === "set") {
    if (!isFreePath(edit.path)) {
      return fail("forbidden", edit.path, "That change is a change ticket, not a free edit.");
    }
    if (getAtPath(next, edit.path) === undefined) {
      // The path parses and is on the free side but names nothing — a stale editor against
      // a spec that has moved on, which is a reload rather than a write.
      const parent = edit.path.slice(0, edit.path.lastIndexOf("."));
      if (getAtPath(next, parent) === undefined) {
        return fail("missing", edit.path, "That field no longer exists on your site.");
      }
    }

    const blocker = altBlocker(next, edit.path, edit.value);
    if (blocker) {
      return fail(
        "alt-required",
        edit.path,
        `Add a ${blocker.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} first — it is what screen readers announce for this image.`,
      );
    }

    const leaf = parsePath(edit.path).at(-1);
    const value =
      typeof leaf === "string" && STRING_LISTS.has(leaf)
        ? edit.value.split("\n").map((t) => t.trim()).filter(Boolean)
        : typeof leaf === "string" && RICHTEXT_LEAVES.has(leaf)
          ? // The rich-text control posts HTML. It is filtered HERE, not only at render:
            // what is stored is what the client will see quoted back to them in History and
            // in a restore, and storing markup that renders differently from what was saved
            // is the same class of defect as a preview that does not match the build.
            sanitizeRichText(edit.value)
          : edit.value;

    try {
      setAtPath(next, edit.path, value);
    } catch (err) {
      return fail("missing", edit.path, (err as Error).message);
    }
  }

  if (edit.op === "list-add" || edit.op === "list-remove") {
    // A list lives at a free path when its items do: `…props.services` is reached by the
    // same rule as `…props.services[0].title`, so probing the item path answers both.
    if (!isFreePath(`${edit.path}[0].__probe`) && !isFreePath(edit.path)) {
      return fail("forbidden", edit.path, "That list is not editable on your plan.");
    }
    const list = getAtPath(next, edit.path);
    if (!Array.isArray(list)) {
      return fail("missing", edit.path, "That list no longer exists on your site.");
    }

    if (edit.op === "list-add") {
      const template = list.length > 0 ? blankLike(list[0]) : {};
      list.push(template);
    } else {
      if (list.length <= 1) {
        // §1.4 ruling 2 — the ≥1 floor. Emptying a list is what produces the
        // headed-but-empty section QA check 6 catches; preventing it in the control is
        // better than blocking a publish over it.
        return fail("floor", edit.path, "A section needs at least one item.");
      }
      if (edit.index < 0 || edit.index >= list.length) {
        return fail("missing", edit.path, "That item is already gone.");
      }
      list.splice(edit.index, 1);
    }
  }

  const parsed = z.safeParse(siteSpecSchema, next);
  if (!parsed.success) {
    return fail("invalid", edit.path, z.prettifyError(parsed.error));
  }
  return { ok: true, spec: parsed.data };
}

/** Same keys as a sibling item, every value blanked. Keeps `.strict()` satisfied. */
function blankLike(sample: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = "";
    else if (Array.isArray(value)) out[key] = [];
    else if (typeof value === "boolean") out[key] = value;
    else if (value !== null && typeof value === "object") out[key] = {};
  }
  return out;
}

/** Applies a batch, stopping at the first failure so a partial write is never persisted. */
export function applyEdits(current: SiteSpec, edits: EditOp[]): ApplyResult {
  let spec = current;
  for (const edit of edits) {
    const result = applyEdit(spec, edit);
    if (!result.ok) return result;
    spec = result.spec;
  }
  return { ok: true, spec };
}
