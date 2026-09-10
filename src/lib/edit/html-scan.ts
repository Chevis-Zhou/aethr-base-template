/**
 * A dependency-free HTML scanner — the TypeScript half of the annotated-site reader.
 *
 * Ported from `Business/clients/max-maxematics/MaxTutoring/edit-layer/lib/html.mjs`, which
 * ticket 012's Phase 1 shipped and which the pilot's deploy still runs. The port exists
 * because the *editor* has to read the same markup the *build* does, and the editor runs
 * on Cloudflare Workers where there is no DOM and no `node:fs`. Behaviour is deliberately
 * identical: `scripts/check-annotated-parity.ts` renders the pilot through both and fails
 * on a byte difference, so "two copies" is a checked claim rather than a hope.
 *
 * Not a spec-compliant parser. It handles what hand-authored and generator-emitted pages
 * actually use: tags, attributes, comments, void elements, self-closing SVG tags, and
 * raw-text elements. That is enough to know whether a `{{token}}` sits in text, in an
 * attribute value or inside a script, and to scope a token to its annotated ancestor.
 */

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_TEXT = new Set(["script", "style"]);

export interface ScanAttr {
  name: string;
  value: string;
  /** Offsets of the attribute *value* in the source, or -1 for a valueless attribute. */
  vStart: number;
  vEnd: number;
}

export type ScanNode =
  | { kind: "text" | "comment" | "doctype"; start: number; end: number; raw: string }
  | {
      kind: "open";
      start: number;
      end: number;
      raw: string;
      name: string;
      selfClosing: boolean;
      attrs: ScanAttr[];
    }
  | { kind: "close"; start: number; end: number; raw: string; name: string }
  | { kind: "raw"; start: number; end: number; raw: string; owner: string };

export type OpenNode = Extract<ScanNode, { kind: "open" }>;

export function scan(html: string): ScanNode[] {
  const out: ScanNode[] = [];
  let i = 0;
  const n = html.length;

  const pushText = (from: number, to: number) => {
    if (to > from) out.push({ kind: "text", start: from, end: to, raw: html.slice(from, to) });
  };

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      pushText(i, n);
      break;
    }
    pushText(i, lt);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end === -1 ? n : end + 3;
      out.push({ kind: "comment", start: lt, end: stop, raw: html.slice(lt, stop) });
      i = stop;
      continue;
    }
    if (html.startsWith("<!", lt)) {
      const end = html.indexOf(">", lt);
      const stop = end === -1 ? n : end + 1;
      out.push({ kind: "doctype", start: lt, end: stop, raw: html.slice(lt, stop) });
      i = stop;
      continue;
    }
    if (html.startsWith("</", lt)) {
      const end = html.indexOf(">", lt);
      if (end === -1) {
        pushText(lt, n);
        break;
      }
      const name = html.slice(lt + 2, end).trim().toLowerCase();
      out.push({ kind: "close", start: lt, end: end + 1, raw: html.slice(lt, end + 1), name });
      i = end + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(html[lt + 1] ?? "")) {
      // A bare "<" in text ("a < b"), not a tag.
      pushText(lt, lt + 1);
      i = lt + 1;
      continue;
    }

    const tag = readOpenTag(html, lt);
    if (!tag) {
      pushText(lt, lt + 1);
      i = lt + 1;
      continue;
    }
    out.push(tag);
    i = tag.end;

    if (RAW_TEXT.has(tag.name) && !tag.selfClosing) {
      const closeIdx = findRawClose(html, tag.name, i);
      out.push({
        kind: "raw",
        start: i,
        end: closeIdx,
        raw: html.slice(i, closeIdx),
        owner: tag.name,
      });
      i = closeIdx;
    }
  }
  return out;
}

function findRawClose(html: string, name: string, from: number): number {
  const hit = html.slice(from).search(new RegExp(`</${name}\\b`, "i"));
  return hit === -1 ? html.length : from + hit;
}

function readOpenTag(html: string, start: number): OpenNode | null {
  let i = start + 1;
  const nameStart = i;
  while (i < html.length && /[A-Za-z0-9:_-]/.test(html[i])) i++;
  const name = html.slice(nameStart, i).toLowerCase();
  if (!name) return null;

  const attrs: ScanAttr[] = [];
  let explicitSelfClose = false;

  for (;;) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length) break;
    if (html[i] === ">") {
      i++;
      break;
    }
    if (html[i] === "/" && html[i + 1] === ">") {
      i += 2;
      explicitSelfClose = true;
      break;
    }

    const aStart = i;
    while (i < html.length && !/[\s=>/]/.test(html[i])) i++;
    const aName = html.slice(aStart, i);
    if (!aName) {
      i++;
      continue;
    }

    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== "=") {
      attrs.push({ name: aName, value: "", vStart: -1, vEnd: -1 });
      continue;
    }
    i++;
    while (i < html.length && /\s/.test(html[i])) i++;

    const q = html[i];
    if (q === '"' || q === "'") {
      const vStart = i + 1;
      const vEnd = html.indexOf(q, vStart);
      const stop = vEnd === -1 ? html.length : vEnd;
      attrs.push({ name: aName, value: html.slice(vStart, stop), vStart, vEnd: stop });
      i = stop + 1;
    } else {
      const vStart = i;
      while (i < html.length && !/[\s>]/.test(html[i])) i++;
      attrs.push({ name: aName, value: html.slice(vStart, i), vStart, vEnd: i });
    }
  }

  return {
    kind: "open",
    start,
    end: i,
    raw: html.slice(start, i),
    name,
    selfClosing: explicitSelfClose || VOID.has(name),
    attrs,
  };
}

export interface Element {
  name: string;
  open: OpenNode | null;
  close: Extract<ScanNode, { kind: "close" }> | null;
  attrs: ScanAttr[];
  children: Element[];
  parent: Element | null;
  contentStart: number;
  contentEnd: number;
}

/**
 * Builds an element tree from a scan. Tolerant: a stray close tag that matches nothing
 * open is ignored, and an unclosed element is closed implicitly by its parent's close.
 */
export function tree(nodes: ScanNode[], html: string): { root: Element } {
  const root: Element = {
    name: "#root",
    open: null,
    close: null,
    attrs: [],
    children: [],
    parent: null,
    contentStart: 0,
    contentEnd: html.length,
  };
  let cur = root;
  const stack: Element[] = [root];

  for (const node of nodes) {
    if (node.kind === "open") {
      const el: Element = {
        name: node.name,
        open: node,
        close: null,
        attrs: node.attrs,
        children: [],
        parent: cur,
        contentStart: node.end,
        contentEnd: node.end,
      };
      cur.children.push(el);
      if (!node.selfClosing) {
        stack.push(el);
        cur = el;
      }
    } else if (node.kind === "close") {
      let depth = -1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === node.name) {
          depth = k;
          break;
        }
      }
      if (depth === -1) continue;
      for (let k = stack.length - 1; k > depth; k--) {
        stack[k].contentEnd = node.start;
        stack.pop();
      }
      const el = stack.pop();
      if (el) {
        el.close = node;
        el.contentEnd = node.start;
      }
      cur = stack[stack.length - 1];
    }
  }
  return { root };
}

/** Attribute lookup on an element or open tag, case-insensitive. */
export function attr(el: { attrs: ScanAttr[] }, name: string): string | undefined {
  return el.attrs.find((a) => a.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Depth-first walk over every element beneath `el`. */
export function* walk(el: Element): Generator<Element> {
  for (const child of el.children) {
    yield child;
    yield* walk(child);
  }
}

export { VOID, RAW_TEXT };
