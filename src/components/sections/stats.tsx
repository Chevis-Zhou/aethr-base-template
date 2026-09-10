"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, animate, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

export interface StatsProps {
  eyebrow?: string;
  heading?: string;
  stats: { value: string; label: string }[];
}

// Splits "500+", "4.9★", "24/7" into an animatable leading number plus a static suffix.
function parseValue(value: string) {
  const match = value.match(/^-?\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = match[0];
  return {
    target: parseFloat(numeric),
    decimals: match[1] ? match[1].length - 1 : 0,
    suffix: value.slice(numeric.length),
  };
}

function StatValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReducedMotion = useReducedMotion();
  const parsed = parseValue(value);

  useEffect(() => {
    const node = ref.current;
    if (!parsed || !node || prefersReducedMotion) return;

    // Leave the SSR value alone until the stat is actually about to animate — resetting it
    // to 0 the moment this effect mounts (the previous behaviour) fires immediately for
    // anything below the fold, so any real visitor who hasn't scrolled yet sees the zero
    // this component exists to avoid shipping. The count-up's own 0-start happens right
    // here, one line below, immediately before `animate()` — never earlier.
    if (!isInView) return;
    node.textContent = `0${parsed.suffix}`;

    const controls = animate(0, parsed.target, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate(latest) {
        node.textContent = `${latest.toFixed(parsed.decimals)}${parsed.suffix}`;
      },
    });
    return () => controls.stop();
  }, [isInView, parsed, prefersReducedMotion]);

  return <span ref={ref}>{value}</span>;
}

export function StatsSection({ eyebrow, heading, stats }: StatsProps) {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
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
        <dl
          className={cn(
            "grid grid-cols-1 gap-8 text-center md:grid-cols-2 lg:grid-cols-4",
            (eyebrow || heading) && "mt-12"
          )}
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col-reverse"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {/* dt before dd in the DOM — axe's dl/dt/dd ordering rule — with the visual
                  order (value above label) kept via flex-col-reverse rather than markup order. */}
              <dt className="mt-2 text-sm text-muted-foreground">{stat.label}</dt>
              <dd className="font-heading text-4xl font-bold text-primary sm:text-5xl">
                <StatValue value={stat.value} />
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
