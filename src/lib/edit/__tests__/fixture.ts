import { readFileSync } from "node:fs";
import { z } from "zod/v4";
import { siteSpecSchema, type SiteSpec } from "@/lib/assembly/site-spec";

/**
 * The smallest spec that parses, carrying one of each shape the edit layer branches on:
 * a paid link (`hero.ctaHref`), a free image with a blank alt sibling (`about.founderImage`
 * / `founderName`), a one-item list at its floor (`services.services`), and a string-list
 * leaf (`portfolio.projects[].tags`).
 *
 * Built by a function, not exported as a constant: `applyEdit` clones its input, but a test
 * that mutated a shared literal would still leak into the next one through the clone source.
 */
export function makeSpec(): SiteSpec {
  return {
    client: {
      name: "Acme Co",
      tagline: "We do the thing",
      description: "A description.",
      email: "hi@acme.test",
      social: {},
    },
    tokens: {
      primaryHue: "210",
      primarySaturation: "80%",
      primaryLightness: "50%",
      secondaryHue: "160",
      secondarySaturation: "60%",
      secondaryLightness: "45%",
      accentHue: "30",
      accentSaturation: "90%",
      accentLightness: "55%",
      fontHeading: "Inter",
      fontBody: "Inter",
      radius: "0.5rem",
    },
    pages: [
      {
        slug: "/",
        title: "Home",
        sections: [
          {
            type: "hero",
            props: {
              headline: "Original headline",
              subheadline: "Original subheadline",
              ctaText: "Get in touch",
              ctaHref: "/contact",
            },
          },
          {
            type: "about",
            props: {
              heading: "About us",
              story: "<p>The story.</p>",
              founderName: "",
              founderImage: "",
            },
          },
          {
            type: "services",
            props: {
              heading: "Services",
              services: [{ title: "Only service", description: "The one item." }],
            },
          },
          {
            type: "portfolio",
            props: {
              heading: "Work",
              projects: [
                { title: "A project", description: "Did a thing.", image: "/a.jpg", tags: ["one"] },
              ],
            },
          },
        ],
      },
    ],
    seo: { siteName: "Acme Co" },
  };
}

/**
 * The repo's own every-section sample, parsed through the schema.
 *
 * Used where the claim is about coverage rather than about one branch: a spec written by
 * hand covers the four section types its author thought of, and this one is maintained
 * beside `section-props.ts`, so a fifteenth section type reaches the tests on the day it
 * ships rather than whenever someone remembers to widen a fixture.
 */
export function allSectionsSpec(): SiteSpec {
  const raw = JSON.parse(
    readFileSync(new URL("../../assembly/sample-specs/_all-sections.json", import.meta.url), "utf8"),
  );
  return z.parse(siteSpecSchema, raw);
}

/** Paths into `makeSpec()`, so a test reads as a claim about behaviour, not about indices. */
export const P = {
  headline: "pages[0].sections[0].props.headline",
  ctaHref: "pages[0].sections[0].props.ctaHref",
  story: "pages[0].sections[1].props.story",
  founderName: "pages[0].sections[1].props.founderName",
  founderImage: "pages[0].sections[1].props.founderImage",
  services: "pages[0].sections[2].props.services",
  serviceTitle: "pages[0].sections[2].props.services[0].title",
  projectTags: "pages[0].sections[3].props.projects[0].tags",
  clientEmail: "client.email",
  primaryHue: "tokens.primaryHue",
  pageSlug: "pages[0].slug",
} as const;
