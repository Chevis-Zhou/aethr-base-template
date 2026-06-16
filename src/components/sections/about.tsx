import { cn } from "@/lib/utils";

export interface AboutProps {
  heading: string;
  story: string;
  founderName?: string;
  founderRole?: string;
  founderImage?: string;
  mission?: string;
}

export function AboutSection({
  heading,
  story,
  founderName,
  founderRole,
  founderImage,
  mission,
}: AboutProps) {
  const paragraphs = story.split("\n\n").filter(Boolean);
  const hasFounder = Boolean(founderName || founderRole || founderImage);

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {heading}
        </h2>

        <div className={cn("mt-10 grid gap-10", hasFounder && "lg:grid-cols-3 lg:gap-12")}>
          <div
            className={cn(
              "space-y-4 text-base leading-relaxed text-muted-foreground",
              hasFounder && "lg:col-span-2"
            )}
          >
            {paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}

            {mission && (
              <div className="mt-8 rounded-2xl bg-muted p-6 sm:p-8">
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                  Our Mission
                </p>
                <p className="mt-2 text-lg font-medium text-foreground">{mission}</p>
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
                />
              )}
              <div>
                {founderName && (
                  <p className="font-heading text-lg font-semibold text-foreground">
                    {founderName}
                  </p>
                )}
                {founderRole && <p className="text-sm text-muted-foreground">{founderRole}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
