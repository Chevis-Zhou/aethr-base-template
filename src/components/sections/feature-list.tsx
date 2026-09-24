import { resolveIcon } from "./icon-map";
import { mark, markItem, markList, within, type EditProps } from "../../lib/edit/markers";

export interface FeatureListProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  features: { title: string; description: string; icon?: string }[];
}

/**
 * The differentiator list — "what makes us different", as a two-column reading list.
 * Deliberately not a card grid: `services` already owns that shape, and a differentiator
 * is a claim to read rather than an item to scan.
 */
export function FeatureListSection({
  eyebrow,
  heading,
  subheading,
  features,
  edit,
}: FeatureListProps & EditProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
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
          {subheading && (
            <p className="mt-4 text-lg text-muted-foreground" {...mark(edit, "subheading", "textarea")}>
              {subheading}
            </p>
          )}
        </div>

        {/* A plain list, not a <dl>: icon + title + description isn't a term/definition pair,
            and the icon column would have needed a second <div> layer between <dl> and its
            <dt>/<dd> — which axe correctly flags, since a <dl> may wrap one level of <div>
            around a dt/dd group, never two. */}
        <ul
          className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2"
          {...markList(edit, "features")}
        >
          {features.map((feature, index) => {
            const Icon = resolveIcon(feature.icon);
            const item = within(edit, `features[${index}]`);
            return (
              <li key={feature.title} className="flex gap-4" {...markItem(edit, index)}>
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  {...mark(item, "icon", "icon")}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-heading text-lg font-semibold text-foreground" {...mark(item, "title")}>
                    {feature.title}
                  </p>
                  {feature.description && (
                    <p
                      className="mt-2 text-base leading-relaxed text-muted-foreground"
                      {...mark(item, "description", "textarea")}
                    >
                      {feature.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
