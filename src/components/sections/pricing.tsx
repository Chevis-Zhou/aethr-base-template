import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";

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

export function PricingSection({ eyebrow, heading, subheading, note, tiers }: PricingProps) {
  // One to four tiers is the realistic range for this palette; the column count follows the
  // actual length so a two-tier table centres instead of leaving a hole in a three-up grid.
  const columns =
    tiers.length >= 3 ? "lg:grid-cols-3" : tiers.length === 2 ? "sm:grid-cols-2" : "max-w-md";

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {heading}
            </h2>
          )}
          {subheading && <p className="mt-4 text-lg text-muted-foreground">{subheading}</p>}
        </div>

        <div className={cn("mx-auto mt-12 grid grid-cols-1 gap-6", columns)}>
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "flex h-full flex-col",
                tier.featured && "ring-2 ring-primary shadow-lg"
              )}
            >
              <CardHeader>
                <CardTitle className="font-heading text-lg">{tier.name}</CardTitle>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-bold text-foreground">
                    {tier.price}
                  </span>
                  {tier.cadence && (
                    <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                  )}
                </p>
                {tier.description && <CardDescription>{tier.description}</CardDescription>}
              </CardHeader>

              <CardContent className="flex flex-1 flex-col justify-between gap-6">
                {tier.includes && tier.includes.length > 0 && (
                  <ul className="space-y-3">
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
                  >
                    {tier.ctaText}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {note && (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">{note}</p>
        )}
      </div>
    </section>
  );
}
