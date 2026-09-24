import type * as React from "react";

import { cn } from "../../lib/utils";
import { renderRichText } from "../../lib/rich-text";

/**
 * Renders a rich-text field — the one place in the template that sets HTML from content.
 *
 * Sanitising happens on the write path (`lib/edit/apply.ts`) *and* here. That is not
 * belt-and-braces for its own sake: a spec can also arrive from ANALYSIS, from a hand-edited
 * `spec.json`, or from a restored version frozen before the write path existed, and none of
 * those went through the editor. `renderRichText` is total — a plain string becomes
 * paragraphs, markup is filtered to the allowlist — so every source lands on the same output.
 *
 * The `rich-text` class carries the element styling (`globals.css`). Tailwind cannot reach
 * inside `dangerouslySetInnerHTML`, and Typography is a plugin this template does not have.
 */
export function RichText({
  value,
  className,
  ...rest
}: {
  value?: string | null;
  className?: string;
} & Omit<React.ComponentProps<"div">, "dangerouslySetInnerHTML" | "children">) {
  const html = renderRichText(value);
  if (!html) return null;
  return (
    <div
      className={cn("rich-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  );
}
