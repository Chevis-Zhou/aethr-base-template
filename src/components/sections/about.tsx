import { cn } from "../../lib/utils";
import { RichText } from "../ui/rich-text";
import { mark, type EditProps } from "../../lib/edit/markers";

export interface AboutProps {
  eyebrow?: string;
  heading: string;
  story: string;
  founderName?: string;
  founderRole?: string;
  founderImage?: string;
  mission?: string;
  pullQuote?: string;
}

export function AboutSection({
  eyebrow,
  heading,
  story,
  founderName,
  founderRole,
  founderImage,
  mission,
  pullQuote,
  edit,
}: AboutProps & EditProps) {
  const hasFounder = Boolean(founderName || founderRole || founderImage);

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
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
            className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            {...mark(edit, "heading")}
          >
            {heading}
          </h2>
        )}

        <div className={cn("mt-10 grid gap-10", hasFounder && "lg:grid-cols-3 lg:gap-12")}>
          <div
            className={cn(
              "space-y-4 text-base leading-relaxed text-muted-foreground",
              hasFounder && "lg:col-span-2"
            )}
          >
            {/* Was `story.split("\n\n").map(<p>)`. `RichText` still renders exactly that
                for a plain-text story, so nothing was migrated — it also accepts the
                markup the self-edit tool's rich-text control now writes. */}
            <RichText value={story} {...mark(edit, "story", "richtext")} />

            {pullQuote && (
              <blockquote
                className="mt-8 border-l-2 border-primary pl-6 font-heading text-xl font-medium text-balance text-foreground sm:text-2xl"
                {...mark(edit, "pullQuote")}
              >
                {pullQuote}
              </blockquote>
            )}

            {mission && (
              <div className="mt-8 rounded-2xl bg-muted p-6 sm:p-8">
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                  Our Mission
                </p>
                <p className="mt-2 text-lg font-medium text-foreground" {...mark(edit, "mission", "textarea")}>
                  {mission}
                </p>
              </div>
            )}
          </div>

          {hasFounder && (
            <div className="flex flex-col items-start gap-4 lg:items-center lg:text-center">
              {founderImage && (
                /* eslint-disable-next-line @next/next/no-img-element -- arbitrary client-supplied image URLs, no fixed remote-pattern allowlist across 30+ sites */
                <img
                  src={founderImage}
                  alt={founderName ?? ""}
                  className="h-40 w-40 rounded-full object-cover ring-1 ring-border"
                  loading="lazy"
                  {...mark(edit, "founderImage", "image")}
                />
              )}
              <div>
                {founderName && (
                  <p
                    className="font-heading text-lg font-semibold text-foreground"
                    {...mark(edit, "founderName")}
                  >
                    {founderName}
                  </p>
                )}
                {founderRole && (
                  <p className="text-sm text-muted-foreground" {...mark(edit, "founderRole")}>
                    {founderRole}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
