import type { ReactNode } from "react";

/**
 * Preview-only edit markers — ticket 012's 2026-09-20 amendment §A, Phase 3.
 *
 * A hand-built site arrives already addressed: `edit-layer/SPEC.md` makes the developer
 * write `data-ae="dot.path"` into the markup, and the canvas reads it. The assembled
 * carrier has no such markup — the fourteen section components render props — so the same
 * attributes are emitted *here*, from the components themselves, and **only when the
 * preview asks for them**.
 *
 * The whole design is one rule: `mark(undefined, …)` returns an empty object, and
 * `generate.ts` never passes an `edit` prop. So a built site spreads `{}` onto the same
 * elements it always had, and its HTML is byte-identical to what it was before this file
 * existed — which `scripts/check-edit-markers-parity.ts` asserts rather than assumes.
 *
 * **Not a React context, deliberately.** A context would be read with `useContext`, which
 * would make all fourteen section components client components — eight of them are server
 * components today, and turning them client ships a hydration payload into every site we
 * build to serve a surface no visitor ever sees. An optional prop costs the preview one
 * attribute at the call site and costs a built site nothing at all.
 *
 * The attribute vocabulary is the annotated one, unchanged, so the portal's overlay and
 * text seam are the same code on both carriers:
 *
 * - `data-ae` — the inventory field id, which must equal what `spec-adapter.ts` emits.
 * - `data-ae-type` — `text` · `richtext` · `image` · `icon` · `string-list` · `list`.
 * - `data-ae-slot="value"` — on a text marker, and it means what it means in SPEC §4:
 *   *this element's entire text is the field's value*. The assembled side can promise that
 *   because it places the marker itself, which is what lets the canvas edit in place
 *   without wrapping a text node the way a hand-built page needs.
 * - `data-ae-multiline` — a newline is a real newline here. Still gated at runtime on
 *   what the page's `white-space` actually renders.
 * - `data-ae-item` — the item's index inside its list, for duplicate and remove.
 */

/** Where a component's paths hang, plus any leaf whose id is not the leaf's own name. */
export interface EditMarkers {
  /** Path prefix, e.g. `pages[0].sections[2].props`. Empty for a site-level group. */
  readonly prefix: string;
  /**
   * Local prop name → the name it has in the document, or `null` for "not a field".
   *
   * One component, two homes: `FooterSection` is both the `footer` section type (whose
   * fields are `…props.companyName`) and the site-wide footer the layout renders from
   * `client.*`. The component cannot know which it is in, so the caller says.
   */
  readonly rename?: Readonly<Record<string, string | null>>;
}

export type MarkerKind =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "icon"
  | "string-list"
  | "list";

const TEXTUAL: ReadonlySet<MarkerKind> = new Set(["text", "textarea", "richtext"]);
const MULTILINE: ReadonlySet<MarkerKind> = new Set(["textarea", "richtext"]);

/** The document path for a local prop path, or `null` when the caller ruled it out. */
function idOf(edit: EditMarkers, path: string): string | null {
  const dot = path.indexOf(".");
  const head = dot === -1 ? path : path.slice(0, dot);
  const renamed = edit.rename?.[head];
  if (renamed === null) return null;
  const resolved = renamed === undefined ? path : renamed + (dot === -1 ? "" : path.slice(dot));
  return edit.prefix ? `${edit.prefix}.${resolved}` : resolved;
}

/**
 * The marker attributes for one field, or nothing at all.
 *
 * Spread onto the element whose text (or image) *is* the value — nothing beside it. Where
 * the value shares an element with decoration, use `<Mark>` instead.
 */
export function mark(
  edit: EditMarkers | undefined,
  path: string,
  kind: MarkerKind = "text",
): Record<string, string> {
  if (!edit) return {};
  const id = idOf(edit, path);
  if (id === null) return {};

  const attrs: Record<string, string> = {
    "data-ae": id,
    "data-ae-type": kind === "textarea" ? "text" : kind,
  };
  if (TEXTUAL.has(kind)) attrs["data-ae-slot"] = "value";
  if (MULTILINE.has(kind)) attrs["data-ae-multiline"] = "true";
  return attrs;
}

/** The container of an editable array. Its items carry `markItem`. */
export function markList(edit: EditMarkers | undefined, path: string): Record<string, string> {
  return mark(edit, path, "list");
}

/**
 * An element the client can see and cannot edit — a link's destination, the nav.
 *
 * §7 makes the boundary the upsell surface, at the point of intent: the canvas answers a
 * click here with a priced lock chip rather than with nothing. It carries no path, because
 * what is being bought is the change, not the field — the rail's own locked controls name
 * it. `major` is the $300 class (structure and navigation); `minor` is $100.
 */
export function markLocked(
  edit: EditMarkers | undefined,
  klass: "minor" | "major" = "major",
): Record<string, string> {
  return edit ? { "data-ae-locked": klass } : {};
}

/** One item of that array, by its index in the document — never its DOM position. */
export function markItem(edit: EditMarkers | undefined, index: number): Record<string, string> {
  return edit ? { "data-ae-item": String(index) } : {};
}

/** A child scope — `within(edit, "services[2]")` addresses that item's own leaves. */
export function within(
  edit: EditMarkers | undefined,
  path: string,
): EditMarkers | undefined {
  if (!edit) return undefined;
  const id = idOf(edit, path);
  return id === null ? undefined : { prefix: id };
}

/**
 * A marker that needs an element of its own.
 *
 * For the handful of places where the value is rendered beside decoration the client does
 * not own — a testimonial's typographic quotes. With markers off this renders the children
 * and no element, so the built page is unchanged; with markers on it adds the one wrapper
 * the canvas needs to know where the value stops.
 */
export function Mark({
  edit,
  path,
  kind = "text",
  as = "span",
  className,
  children,
}: {
  edit: EditMarkers | undefined;
  path: string;
  kind?: MarkerKind;
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}) {
  if (!edit) return <>{children}</>;
  const attrs = mark(edit, path, kind);
  return as === "div" ? (
    <div className={className} {...attrs}>
      {children}
    </div>
  ) : (
    <span className={className} {...attrs}>
      {children}
    </span>
  );
}

/**
 * The prop every markable component takes, intersected rather than declared inside its own
 * `Props` interface — `section-props.conformance.ts` asserts structural *identity* between
 * a component's props and its Zod schema, and it is right to: `edit` is not part of the
 * spec contract and a spec carrying it must still be rejected by `.strict()`.
 */
export interface EditProps {
  /** Preview-only edit markers. Never passed by a built site. */
  edit?: EditMarkers;
}
