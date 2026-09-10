"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";

export interface CTABandProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  ctaText: string;
  ctaHref: string;
  variant?: "primary" | "secondary" | "accent";
}

const VARIANT_STYLES: Record<
  NonNullable<CTABandProps["variant"]>,
  { section: string; button: string }
> = {
  primary: {
    section: "bg-primary text-primary-foreground",
    button: "bg-background text-foreground hover:bg-background/90",
  },
  secondary: {
    section: "bg-secondary text-secondary-foreground",
    button: "bg-background text-foreground hover:bg-background/90",
  },
  accent: {
    section: "bg-accent text-accent-foreground",
    button: "bg-background text-foreground hover:bg-background/90",
  },
};

export function CTABandSection({
  eyebrow,
  heading,
  subheading,
  ctaText,
  ctaHref,
  variant = "primary",
}: CTABandProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <section className={cn("py-16 md:py-20", styles.section)}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-3xl px-4 text-center sm:px-6"
      >
        {eyebrow && (
          <p className="mb-3 text-sm font-semibold tracking-wide uppercase opacity-80">{eyebrow}</p>
        )}
        {heading && (
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {heading}
          </h2>
        )}
        {subheading && <p className="mt-4 text-lg opacity-90">{subheading}</p>}
        <Link
          href={ctaHref}
          className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11 px-8 text-base", styles.button)}
        >
          {ctaText}
        </Link>
      </motion.div>
    </section>
  );
}
