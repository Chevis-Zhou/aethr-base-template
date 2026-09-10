"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";

export interface PortfolioProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  projects: {
    title: string;
    description: string;
    image: string;
    tags?: string[];
    link?: string;
  }[];
}

export function PortfolioSection({ eyebrow, heading, subheading, projects }: PortfolioProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
          )}
          {heading && (
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {heading}
            </h2>
          )}
          {subheading && <p className="mt-4 text-lg text-muted-foreground">{subheading}</p>}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const card = (
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full"
              >
                <Card className="h-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary client-supplied image URLs, no fixed remote-pattern allowlist across 30+ sites */}
                  <img
                    src={project.image}
                    alt={project.title}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                  <CardHeader>
                    <CardTitle>{project.title}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>
                  {project.tags && project.tags.length > 0 && (
                    <CardContent className="flex flex-wrap gap-2">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </CardContent>
                  )}
                </Card>
              </motion.div>
            );

            return project.link ? (
              <Link key={project.title} href={project.link} className="block h-full">
                {card}
              </Link>
            ) : (
              <div key={project.title} className="h-full">
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
