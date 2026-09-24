import Link from "next/link";
import { cn } from "../../lib/utils";
import { mark, markLocked, type EditProps } from "../../lib/edit/markers";

export interface DisclosureProps {
  eyebrow?: string;
  heading?: string;
  body: string;
  links?: { label: string; href: string }[];
  variant?: "fineprint" | "panel";
}

/**
 * Regulatory and legal disclosure text — the paragraph a regulated practice is required to
 * publish, and the linked documents that go with it.
 *
 * It is its own section type rather than free text inside `about` for one reason: a
 * disclosure has to be *placed*, and placement is the whole design question. `fineprint`
 * (the default) is the quiet full-width block that sits above the footer, which is where
 * most of them belong. `panel` is for the load-bearing case — a "this is not investment
 * advice" line directly under a pricing table, where burying it defeats the purpose.
 *
 * `heading` is optional because a large share of real disclosures carry no heading at all;
 * this follows `stats`, which made the same call for the same reason.
 *
 * Per ruling 10 the schema constrains shape only. Nothing here validates that the text is
 * adequate, current or correct for the client's jurisdiction — that is the client's
 * counsel's job, and it is stated in `SPEC-FORMAT.md` so ANALYSIS never invents one.
 */
export function DisclosureSection({
  eyebrow,
  heading,
  body,
  links,
  variant = "fineprint",
  edit,
}: DisclosureProps & EditProps) {
  const paragraphs = body.split("\n\n");
  const isPanel = variant === "panel";

  return (
    <section className={cn(isPanel ? "py-12 md:py-16" : "py-10")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          className={cn(
            "mx-auto max-w-3xl",
            isPanel
              ? "rounded-lg border border-border bg-muted/30 p-6 md:p-8"
              : "border-t border-border pt-8",
          )}
        >
          {eyebrow && (
            <p
              className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase"
              {...mark(edit, "eyebrow")}
            >
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2
              className={cn(
                "font-heading font-semibold text-foreground",
                isPanel ? "text-xl" : "text-sm tracking-wide uppercase",
              )}
              {...mark(edit, "heading")}
            >
              {heading}
            </h2>
          )}

          <div
            className={cn(
              "space-y-4 text-muted-foreground",
              isPanel ? "mt-4 text-base leading-relaxed" : "mt-3 text-sm leading-relaxed",
              !heading && !eyebrow && "mt-0",
            )}
            {...mark(edit, "body", "textarea")}
          >
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {links && links.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2" {...markLocked(edit)}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
