import { scan } from "./html-scan";

/**
 * The `{{token}}` renderer for annotated sites — `template.html` + `content.json` → HTML.
 *
 * Ported from `edit-layer/lib/template.mjs` (ticket 012 Phase 1), for the same reason
 * `html-scan.ts` is: this has to run in the editor, in a Worker, on every keystroke. That
 * makes the annotated preview *instant by the same mechanism the assembled preview is* —
 * the client sees the real renderer's output, not a patched DOM.
 *
 * This supersedes the amendment's assumption that annotated sites would preview through
 * Phase 1's `postMessage` bridge. The bridge's job was to avoid re-rendering the page; a
 * pure string render of an 81 KB document costs under a millisecond, so the bridge buys
 * nothing and costs a script inside the client's site plus a version negotiation. §2.3's
 * rejection of click-on-your-live-text is untouched — nothing is written from the iframe,
 * and the iframe here is a `srcDoc` the portal produced.
 *
 * Escaping is context-aware and deliberately minimal, so splitting an existing page and
 * rebuilding it reproduces the original bytes.
 */

const TOKEN_RE =
  /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*(#each\s+[^}]+?|\/each|json\s+[^}]+?|[^}#/][^}]*?)\s*\}\}/g;

export class TemplateError extends Error {}

/** `a.b.0.c` → `['a','b','0','c']`. The only path syntax annotated sites use. */
export function pathSegments(path: string): string[] {
  return String(path)
    .split(".")
    .filter((segment) => segment.length > 0);
}

export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const segment of pathSegments(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

export function hasPath(root: unknown, path: string): boolean {
  let cur: unknown = root;
  for (const segment of pathSegments(path)) {
    if (cur === null || typeof cur !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(cur, segment)) return false;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return true;
}

/**
 * Writes into containers that already exist, and refuses to create one.
 *
 * Same rule as `setAtPath` on the assembled side, and it does the same job: the annotation
 * is the partition for these sites, so inventing an intermediate object would let the
 * editor mint content the developer never annotated.
 */
export function setPath(root: unknown, path: string, value: unknown): void {
  const segments = pathSegments(path);
  const leaf = segments.pop();
  if (leaf === undefined) throw new TemplateError("Empty path");

  let node: unknown = root;
  for (const segment of segments) {
    node = (node as Record<string, unknown> | undefined)?.[segment];
    if (node === null || node === undefined) {
      throw new TemplateError(`No container at "${path}" — refusing to create one`);
    }
  }
  (node as Record<string, unknown>)[leaf] = value;
}

/** Every leaf path in a content document, as dot-strings. */
export function leafPaths(node: unknown, prefix = "", out: string[] = []): string[] {
  if (node !== null && typeof node === "object") {
    const keys = Array.isArray(node)
      ? node.map((_, index) => String(index))
      : Object.keys(node as Record<string, unknown>);
    if (keys.length === 0) out.push(prefix);
    for (const key of keys) {
      leafPaths(
        (node as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key,
        out,
      );
    }
  } else {
    out.push(prefix);
  }
  return out;
}

export function escapeText(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export function escapeAttr(value: unknown, quote = '"'): string {
  const base = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return quote === "'" ? base.replace(/'/g, "&#39;") : base.replace(/"/g, "&quot;");
}

export function jsonLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

type TokenForm = "escaped" | "raw" | "json" | "each" | "endeach";
type TokenCtx = "text" | "attr" | "script" | "style" | "comment";

interface Token {
  form: TokenForm;
  path: string | null;
  start: number;
  end: number;
  raw: string;
  ctx: TokenCtx;
  attrName: string | null;
  quote: string;
  line: number;
}

interface Region {
  start: number;
  end: number;
  ctx: TokenCtx;
  attrName?: string;
  quote?: string;
}

export function parseTokens(html: string): Token[] {
  const regions = buildRegions(html);
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(html)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    let form: TokenForm;
    let path: string | null;

    if (match[1] !== undefined) {
      form = "raw";
      path = match[1].trim();
    } else {
      const body = match[2].trim();
      if (body === "/each") {
        form = "endeach";
        path = null;
      } else if (body.startsWith("#each")) {
        form = "each";
        path = body.slice(5).trim();
      } else if (body.startsWith("json")) {
        form = "json";
        path = body.slice(4).trim();
      } else {
        form = "escaped";
        path = body;
      }
    }

    const region = regionAt(regions, start);
    tokens.push({
      form,
      path,
      start,
      end,
      raw: match[0],
      ctx: region.ctx,
      attrName: region.attrName ?? null,
      quote: region.quote ?? '"',
      line: lineOf(html, start),
    });
  }
  return tokens;
}

function buildRegions(html: string): Region[] {
  const regions: Region[] = [];
  for (const node of scan(html)) {
    if (node.kind === "open") {
      for (const a of node.attrs) {
        if (a.vStart >= 0) {
          regions.push({
            start: a.vStart,
            end: a.vEnd,
            ctx: "attr",
            attrName: a.name,
            quote: html[a.vStart - 1] === "'" ? "'" : '"',
          });
        }
      }
    } else if (node.kind === "raw") {
      regions.push({
        start: node.start,
        end: node.end,
        ctx: node.owner === "style" ? "style" : "script",
      });
    } else if (node.kind === "comment") {
      regions.push({ start: node.start, end: node.end, ctx: "comment" });
    }
  }
  regions.sort((a, b) => a.start - b.start);
  return regions;
}

function regionAt(regions: Region[], pos: number): Region {
  // Regions never overlap: attribute ranges live inside open tags, raw ranges between them.
  for (const region of regions) {
    if (pos >= region.start && pos < region.end) return region;
    if (region.start > pos) break;
  }
  return { start: pos, end: pos, ctx: "text" };
}

export function lineOf(html: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos; i++) if (html.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Expands `{{#each path}}` into per-item copies, rewriting item-relative tokens
 * (`{{ .field }}`) to absolute paths. Purely textual, so contexts survive the copy.
 */
export function expandEach(html: string, content: unknown): string {
  const OPEN = /\{\{\s*#each\s+([^}]+?)\s*\}\}[ \t]*\r?\n?/;
  let out = html;
  let guard = 0;

  for (;;) {
    if (guard++ > 500) {
      throw new TemplateError("each-block expansion did not terminate (nested or unclosed?)");
    }
    const match = OPEN.exec(out);
    if (!match) break;

    const path = match[1].trim();
    const bodyStart = match.index + match[0].length;
    const closeRe = /\{\{\s*\/each\s*\}\}[ \t]*\r?\n?/g;
    closeRe.lastIndex = bodyStart;
    const close = closeRe.exec(out);
    if (!close) {
      throw new TemplateError(
        `{{#each ${path}}} has no matching {{/each}} (line ${lineOf(out, match.index)})`,
      );
    }

    const inner = out.slice(bodyStart, close.index);
    if (/\{\{\s*#each/.test(inner)) {
      throw new TemplateError(
        `nested {{#each}} inside "${path}" — lists do not nest in v1 (line ${lineOf(out, match.index)})`,
      );
    }

    const items = getPath(content, path);
    if (!Array.isArray(items)) {
      throw new TemplateError(
        `{{#each ${path}}} — content key "${path}" is ${items === undefined ? "missing" : "not an array"}`,
      );
    }

    const rendered = items
      .map((_, index) =>
        stampItemIndex(
          inner.replace(
            /\{\{(\{?)\s*\.([A-Za-z0-9_.]+)\s*\}?\}\}/g,
            (_full, brace: string, rel: string) =>
              brace ? `{{{${path}.${index}.${rel}}}}` : `{{${path}.${index}.${rel}}}`,
          ),
          index,
          path,
        ),
      )
      .join("");

    out = out.slice(0, match.index) + rendered + out.slice(close.index + close[0].length);
  }
  return out;
}

/**
 * Stamps `data-ae-item="<index>"` on an item's root element.
 *
 * DOM position does not identify a list item — a page script may clone, reorder or
 * virtualise a container's children, and the pilot's topic rails triple six tiles into
 * eighteen nodes at runtime. A stamped index survives cloning.
 */
function stampItemIndex(itemHtml: string, index: number, path: string): string {
  const first = scan(itemHtml).find((node) => node.kind === "open");
  if (!first) {
    throw new TemplateError(
      `{{#each ${path}}} item template contains no element to carry data-ae-item`,
    );
  }
  const insertAt = first.end - (itemHtml.slice(first.end - 2, first.end) === "/>" ? 2 : 1);
  return `${itemHtml.slice(0, insertAt)} data-ae-item="${index}"${itemHtml.slice(insertAt)}`;
}

/** `template.html` + `content.json` → the built page. */
export function render(template: string, content: unknown): string {
  const expanded = expandEach(template, content);
  const tokens = parseTokens(expanded);
  let out = "";
  let cursor = 0;

  for (const token of tokens) {
    if (token.form === "each" || token.form === "endeach") {
      throw new TemplateError(`unexpanded ${token.raw} at line ${token.line}`);
    }
    const value = getPath(content, token.path ?? "");
    if (value === undefined) {
      throw new TemplateError(`content key "${token.path}" is missing (line ${token.line})`);
    }
    out += expanded.slice(cursor, token.start);
    out += substitute(token, value);
    cursor = token.end;
  }
  return out + expanded.slice(cursor);
}

function substitute(token: Token, value: unknown): string {
  if (token.form === "json") {
    if (token.ctx !== "script") {
      throw new TemplateError(
        `{{json ${token.path}}} is only valid inside <script> (line ${token.line}, context: ${token.ctx})`,
      );
    }
    return jsonLiteral(value);
  }
  if (value !== null && typeof value === "object") {
    throw new TemplateError(
      `content key "${token.path}" is an object/array but is referenced as a scalar (line ${token.line})`,
    );
  }
  if (token.form === "raw") return String(value);
  if (token.ctx === "attr") return escapeAttr(value, token.quote);
  if (token.ctx === "script" || token.ctx === "style") {
    throw new TemplateError(
      `{{ ${token.path} }} inside <${token.ctx}> — use {{json ${token.path}}} instead (line ${token.line})`,
    );
  }
  return escapeText(value);
}
