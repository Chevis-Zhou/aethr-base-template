"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface StatsProps {
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
  const parsed = parseValue(value);

  useEffect(() => {
    if (!isInView || !parsed || !ref.current) return;
    const node = ref.current;
    const controls = animate(0, parsed.target, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate(latest) {
        node.textContent = `${latest.toFixed(parsed.decimals)}${parsed.suffix}`;
      },
    });
    return () => controls.stop();
  }, [isInView, parsed]);

  return <span ref={ref}>{parsed ? `0${parsed.suffix}` : value}</span>;
}

export function StatsSection({ heading, stats }: StatsProps) {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {heading && (
          <h2 className="text-center font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {heading}
          </h2>
        )}
        <dl
          className={cn(
            "grid grid-cols-1 gap-8 text-center md:grid-cols-2 lg:grid-cols-4",
            heading && "mt-12"
          )}
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <dd className="font-heading text-4xl font-bold text-primary sm:text-5xl">
                <StatValue value={stat.value} />
              </dd>
              <dt className="mt-2 text-sm text-muted-foreground">{stat.label}</dt>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
