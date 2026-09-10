"use client";

import { motion } from "motion/react";
import { Quote } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TestimonialsProps {
  eyebrow?: string;
  heading: string;
  testimonials: {
    quote: string;
    author: string;
    role?: string;
    company?: string;
    avatar?: string;
  }[];
}

export function TestimonialsSection({ eyebrow, heading, testimonials }: TestimonialsProps) {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {eyebrow && (
          <p className="mb-3 text-center text-sm font-semibold tracking-wide text-primary uppercase">
            {eyebrow}
          </p>
        )}
        {heading && (
          <h2 className="text-center font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {heading}
          </h2>
        )}

        <div className="mt-12 space-y-8">
          {testimonials.map((testimonial, i) => {
            const meta = [testimonial.role, testimonial.company].filter(Boolean).join(" · ");

            return (
              <motion.div
                key={`${testimonial.author}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: (i % 2) * 0.1 }}
                className={cn("flex", i % 2 === 1 ? "md:justify-end" : "md:justify-start")}
              >
                <div className="relative w-full max-w-2xl rounded-2xl bg-background p-6 shadow-sm ring-1 ring-border sm:p-8">
                  <Quote
                    className="absolute -top-4 left-6 h-8 w-8 text-primary/20"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  <p className="text-lg leading-relaxed text-foreground">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    {testimonial.avatar && (
                      /* eslint-disable-next-line @next/next/no-img-element -- arbitrary client-supplied image URLs, no fixed remote-pattern allowlist across 30+ sites */
                      <img
                        src={testimonial.avatar}
                        alt={testimonial.author}
                        className="h-10 w-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{testimonial.author}</p>
                      {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
