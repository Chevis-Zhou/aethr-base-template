import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Mark, mark, markItem, markList, markLocked, within, type EditProps } from "../../lib/edit/markers";

export interface PricingProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  note?: string;
  tiers: {
    name: string;
    price: string;
    cadence?: string;
    description?: string;
    includes?: string[];
    ctaText?: string;
    ctaHref?: string;
    featured?: boolean;
  }[];
}

export function PricingSection({
  eyebrow,
  heading,
  subheading,
  note,
  tiers,
  edit,
}: PricingProps & EditProps) {
  // One to four tiers is the realistic range for this palette; the column count follows the
  // actual length so a two-tier table centres instead of leaving a hole in a three-up grid.
  const columns =
    tiers.length >= 3 ? "lg:grid-cols-3" : tiers.length === 2 ? "sm:grid-cols-2" : "max-w-md";

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

        <div
          className={cn("mx-auto mt-12 grid grid-cols-1 gap-6", columns)}
          {...markList(edit, "tiers")}
        >
          {tiers.map((tier, index) => (
            <Card
              key={tier.name}
              className={cn(
                "flex h-full flex-col",
                tier.featured && "ring-2 ring-primary shadow-lg"
              )}
              {...markItem(edit, index)}
            >
              <CardHeader>
                <CardTitle
                  className="font-heading text-lg"
                  {...mark(within(edit, `tiers[${index}]`), "name")}
                >
                  {tier.name}
                </CardTitle>
                <p className="mt-2 flex items-baseline gap-1">
                  <span
                    className="font-heading text-4xl font-bold text-foreground"
                    {...mark(within(edit, `tiers[${index}]`), "price")}
                  >
                    {tier.price}
                  </span>
                  {tier.cadence && (
                    <span
                      className="text-sm text-muted-foreground"
                      {...mark(within(edit, `tiers[${index}]`), "cadence")}
                    >
                      {tier.cadence}
                    </span>
                  )}
                </p>
                {tier.description && (
                  <CardDescription {...mark(within(edit, `tiers[${index}]`), "description", "textarea")}>
                    {tier.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="flex flex-1 flex-col justify-between gap-6">
                {tier.includes && tier.includes.length > 0 && (
                  <ul
                    className="space-y-3"
                    {...mark(within(edit, `tiers[${index}]`), "includes", "string-list")}
                  >
                    {tier.includes.map((item) => (
                      <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {tier.ctaText && tier.ctaHref && (
                  <Link
                    href={tier.ctaHref}
                    className={cn(
                      buttonVariants({ variant: tier.featured ? "default" : "outline" }),
                      "w-full"
                    )}
                    {...markLocked(edit)}
                  >
                    <Mark edit={within(edit, `tiers[${index}]`)} path="ctaText">
                      {tier.ctaText}
                    </Mark>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {note && (
          <p
            className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground"
            {...mark(edit, "note", "textarea")}
          >
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
