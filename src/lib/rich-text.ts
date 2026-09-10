/**
 * Rich text — the restricted HTML subset `about.story` and `faq.items[].answer` carry.
 *
 * Ticket 012's implementation record §3 named this as the reason rich text could not ship
 * with the editor's v1: those fields are `z.string()` rendered as `{story}` in JSX, so HTML
 * in them displayed as escaped text. The buy decision (Tiptap) was never the blocker — the
 * *components* had to accept markup first, and that is what this file makes safe to do.
 *
 * Two properties the rest of the feature leans on:
 *
 * 1. **Sanitising is parse-and-rebuild, never pass-through.** Nothing from the input
 *    reaches the output as markup; the output is constructed from an allowlist, with every
 *    text run and attribute value re-escaped. An unrecognised tag, attribute or URL scheme
 *    is therefore dropped by construction rather than by a rule someone remembered to
 *    write. This runs on Cloudflare Workers, where there is no DOM to borrow.
 *
 * 2. **A plain-text value is still valid.** Every story written before this existed is
 *    `"para\n\npara"` with no tags at all, and `renderRichText` turns that into the same
 *    paragraphs `about.tsx` used to build by hand. Nothing was migrated, and a client who
 *    never opens the rich-text control keeps a plain string in their spec forever.
 */

/**
 * The allowlist. Inline emphasis, links, lists, two heading levels and a quote — the set a
 * client edits a paragraph of prose with. Deliberately no `img`, no `table`, no `div`,
 * no `span`, no `style`: those are layout, and layout is the paid side of the partition.
 */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h3",
  "h4",
  "blockquote",
  "code",
]);

/** Presentational synonyms Tiptap and pasted Word/Docs markup both emit. */
const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
  del: "s",
  ins: "u",
};

/** Void elements inside the allowlist. Only one, but the emitter needs to know. */
const VOID_TAGS = new Set(["br"]);

/** Tags whose *contents* are dropped along with the tag. */
const DROP_CONTENT_TAGS = new Set(["script", "style", "template", "iframe", "object", "embed"]);

/** Attributes kept, per tag. Everything else — `style`, `class`, every `on*` — is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

/**
 * URL schemes a client may link to. The same list as the annotation spec's `link` default
 * (`edit-layer/SPEC.md` §5) and for the same reason: this writes into a file served from
 * the client's own domain, so the allowlist is a security control rather than a nicety.
 * `http:` is absent on purpose — a plain-http link on an https site is a mixed-content
 * warning the client cannot diagnose.
 */
const ALLOWED_SCHEMES = new Set(["https:", "mailto:", "tel:"]);

/* ────────────────────────────────────────────────────────────────────────────
 * Escaping
 * ──────────────────────────────────────────────────────────────────────────── */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Named entities worth resolving before a URL is scheme-checked. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Control characters, which are how a scheme check gets walked past (`java\tscript:`). */
const CONTROL_CHARS = new RegExp("[\u0000-\u0020\u007f-\u009f]", "g");

/**
 * `null` for anything not linkable.
 *
 * Entities are decoded and control characters stripped *before* the scheme is read, because
 * `java&#115;cript:` and `java\tscript:` are both how a scheme check gets walked past. A
 * relative path or an in-page anchor has no scheme at all and is allowed — those cannot
 * leave the site.
 */
export function safeHref(raw: string): string | null {
  const value = decodeEntities(raw).replace(CONTROL_CHARS, "");
  if (value === "") return null;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) return value;

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  // No scheme and no leading slash — a bare relative path like `about.html`. A colon
  // cannot appear before the first `/` without matching above, so this cannot smuggle one.
  if (!scheme) return value.includes(":") ? null : value;

  return ALLOWED_SCHEMES.has(`${scheme[1].toLowerCase()}:`) ? value : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sanitising
 * ──────────────────────────────────────────────────────────────────────────── */

interface Tag {
  name: string;
  attrs: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
}

/** Reads one `<…>` starting at `index`. `null` means "not a tag" — treat as text. */
function readTag(html: string, index: number): { tag: Tag; end: number } | null {
  let i = index + 1;
  const closing = html[i] === "/";
  if (closing) i++;

  const nameStart = i;
  while (i < html.length && /[A-Za-z0-9:_-]/.test(html[i])) i++;
  const name = html.slice(nameStart, i).toLowerCase();
  if (!name) return null;

  const attrs: Record<string, string> = {};
  let selfClosing = false;

  for (;;) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length) return { tag: { name, attrs, closing, selfClosing }, end: i };
    if (html[i] === ">") {
      i++;
      break;
    }
    if (html[i] === "/" && html[i + 1] === ">") {
      selfClosing = true;
      i += 2;
      break;
    }

    const attrStart = i;
    while (i < html.length && !/[\s=>/]/.test(html[i])) i++;
    const attrName = html.slice(attrStart, i).toLowerCase();
    if (!attrName) {
      i++;
      continue;
    }

    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== "=") {
      attrs[attrName] = "";
      continue;
    }
    i++;
    while (i < html.length && /\s/.test(html[i])) i++;

    const quote = html[i];
    if (quote === '"' || quote === "'") {
      const valueStart = i + 1;
      const close = html.indexOf(quote, valueStart);
      const stop = close === -1 ? html.length : close;
      attrs[attrName] = html.slice(valueStart, stop);
      i = stop + 1;
    } else {
      const valueStart = i;
      while (i < html.length && !/[\s>]/.test(html[i])) i++;
      attrs[attrName] = html.slice(valueStart, i);
    }
  }

  return { tag: { name, attrs, closing, selfClosing }, end: i };
}

/**
 * The allowlist filter. Output is built from scratch — the input contributes text runs and
 * attribute values, both re-escaped, and nothing else.
 *
 * A dropped tag keeps its children (`<div>text</div>` → `text`), except for the tags in
 * `DROP_CONTENT_TAGS`, whose contents are markup-adjacent by nature and go with them.
 */
export function sanitizeRichText(input: string): string {
  if (!input) return "";

  const out: string[] = [];
  const open: string[] = [];
  let dropDepth = 0;
  let dropTag = "";
  let i = 0;

  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      if (dropDepth === 0) out.push(escapeHtml(decodeEntities(input.slice(i))));
      break;
    }
    if (lt > i && dropDepth === 0) out.push(escapeHtml(decodeEntities(input.slice(i, lt))));

    // Comments and doctypes carry no content worth keeping.
    if (input.startsWith("<!--", lt)) {
      const close = input.indexOf("-->", lt + 4);
      i = close === -1 ? input.length : close + 3;
      continue;
    }
    if (input.startsWith("<!", lt) || input.startsWith("<?", lt)) {
      const close = input.indexOf(">", lt);
      i = close === -1 ? input.length : close + 1;
      continue;
    }

    const read = readTag(input, lt);
    if (!read) {
      // A bare `<` in prose — "scores < 60%". Text, not a tag.
      if (dropDepth === 0) out.push("&lt;");
      i = lt + 1;
      continue;
    }
    i = read.end;

    const { tag } = read;
    const name = TAG_ALIASES[tag.name] ?? tag.name;

    if (dropDepth > 0) {
      if (tag.name === dropTag) dropDepth += tag.closing ? -1 : 1;
      continue;
    }
    if (DROP_CONTENT_TAGS.has(tag.name) && !tag.closing) {
      dropDepth = 1;
      dropTag = tag.name;
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue;

    if (tag.closing) {
      // A close with no matching open is a stray. Unwind to the nearest match so
      // `<p><em>x</p>` still closes the `em` rather than leaking it into the next block.
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    const allowed = ALLOWED_ATTRS[name];
    let attrs = "";
    let hasHref = false;
    if (allowed) {
      for (const [key, value] of Object.entries(tag.attrs)) {
        if (!allowed.has(key)) continue;
        if (key === "href") {
          const href = safeHref(value);
          if (!href) continue;
          hasHref = true;
          attrs += ` href="${escapeHtml(href)}"`;
          continue;
        }
        attrs += ` ${key}="${escapeHtml(decodeEntities(value))}"`;
      }
      // A link that lost its href is no longer a link. `rel` is *added* rather than kept,
      // so a client cannot paste one that opts out of it.
      if (name === "a") {
        if (!hasHref) continue;
        attrs += ' rel="noopener noreferrer"';
      }
    }

    out.push(`<${name}${attrs}>`);
    if (!VOID_TAGS.has(name) && !tag.selfClosing) open.push(name);
  }

  while (open.length > 0) out.push(`</${open.pop()}>`);
  // An empty block carries no content and renders as a gap the client did not ask for —
  // Tiptap leaves one behind after a list, and "a blank line for spacing" is layout, which
  // is the paid side of the partition. Repeated because removing one can empty its parent.
  let html = out.join("");
  for (let pass = 0; pass < 3; pass++) {
    const next = html.replace(/<(p|li|blockquote|h3|h4)>(?:<br>|\s)*<\/\1>/g, "");
    if (next === html) break;
    html = next;
  }
  return html;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Plain text, both directions
 * ──────────────────────────────────────────────────────────────────────────── */

const MARKUP_PROBE = new RegExp(
  `<(${[...ALLOWED_TAGS, ...Object.keys(TAG_ALIASES)].join("|")})(\\s|/?>)`,
  "i",
);

/**
 * Does this value carry markup?
 *
 * Deliberately narrow — one of the allowlisted tags, opened. `story` legitimately contains
 * a `<` ("scores < 60%"), and treating that as markup would strip the rest of the sentence.
 */
export function hasMarkup(value: string): boolean {
  return MARKUP_PROBE.test(value);
}

/** Blank-line paragraphs, single newlines as breaks — what `about.tsx` used to do inline. */
export function plainTextToRichText(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
}

/**
 * What a section actually renders. One function so the live preview, the static build and
 * the QA gate all read the same string — a preview that sanitised differently from the
 * build would reintroduce exactly the drift §2.1 exists to prevent.
 */
export function renderRichText(value: string | undefined | null): string {
  if (!value) return "";
  return hasMarkup(value) ? sanitizeRichText(value) : plainTextToRichText(value);
}

/**
 * The rendered *text*, for character counts and for QA checks that read copy.
 *
 * The gate's content checks count words a visitor can see; counting `</blockquote>` toward
 * a section's body length is how a section full of empty markup passes check 6.
 */
export function richTextToPlainText(value: string | undefined | null): string {
  if (!value) return "";
  if (!hasMarkup(value)) return value;
  return decodeEntities(
    sanitizeRichText(value)
      .replace(/<(br|\/p|\/li|\/h3|\/h4|\/blockquote)\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
