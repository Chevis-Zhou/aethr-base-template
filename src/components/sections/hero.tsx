"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";
import { Mark, mark, markLocked, type EditProps } from "../../lib/edit/markers";

export interface HeroProps {
  eyebrow?: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaHref: string;
  backgroundImage?: string;
}

export function HeroSection({
  eyebrow,
  headline,
  subheadline,
  ctaText,
  ctaHref,
  backgroundImage,
  edit,
}: HeroProps & EditProps) {
  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden"
      /* The background is a CSS fill with no `<img>` to click, so the frame itself is the
         image's layer — Framer's frame-with-image-fill behaviour (reference §7). */
      {...mark(edit, "backgroundImage", "image")}
    >
      {backgroundImage ? (
        <>
          <div
            className="absolute inset-0 -z-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
          <div className="absolute inset-0 -z-10 bg-foreground/60" />
        </>
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-muted/60 to-background" />
      )}

      <div className="mx-auto w-full max-w-7xl px-4 py-24 text-center sm:px-6">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
              "mb-3 text-sm font-semibold tracking-wide uppercase",
              backgroundImage ? "text-white/85" : "text-primary"
            )}
            {...mark(edit, "eyebrow")}
          >
            {eyebrow}
          </motion.p>
        )}
        {headline && (
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
              "font-heading text-4xl font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl",
              backgroundImage ? "text-white" : "text-foreground"
            )}
            {...mark(edit, "headline")}
          >
            {headline}
          </motion.h1>
        )}
        {subheadline && (
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className={cn(
              "mx-auto mt-6 max-w-2xl text-balance text-lg sm:text-xl",
              backgroundImage ? "text-white/85" : "text-muted-foreground"
            )}
            {...mark(edit, "subheadline", "textarea")}
          >
            {subheadline}
          </motion.p>
        )}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="mt-10"
        >
          <Link
            href={ctaHref}
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-8 text-base")}
            {...markLocked(edit)}
          >
            <Mark edit={edit} path="ctaText">
              {ctaText}
            </Mark>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
