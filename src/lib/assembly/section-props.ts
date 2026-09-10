import { z } from "zod/v4";

/**
 * One Zod schema per section type, mirroring the component's exported TypeScript
 * interface exactly.
 *
 * Why this file exists: `props` used to be `z.record(z.string(), z.unknown())`, so a
 * `hero` with `{}` or a typo'd `headliine` parsed clean and only died at `next build` —
 * downstream of the REVIEW gate, where a human had already approved a spec that could
 * not build. These schemas move that failure upstream of REVIEW.
 *
 * Two rules govern what may go in here, both from the map's ruling 10 ("closed palette,
 * open hand"): schemas constrain *shape*, never *content* — no min-lengths, no content
 * enums, nothing that tells the model what to write. And they mirror the interfaces
 * rather than extending them: if a field is not in the component's props, it does not
 * belong here.
 *
 * `.strict()` is a shape constraint, not a content one, and it is what turns a
 * misspelled prop into a named error instead of a silently-dropped key.
 */

/** Present on every section that renders a heading — the small kicker above it. */
const eyebrow = z.string().optional();

const navItem = z.object({
  label: z.string(),
  href: z.string(),
});

export const heroProps = z
  .object({
    eyebrow,
    headline: z.string(),
    subheadline: z.string(),
    ctaText: z.string(),
    ctaHref: z.string(),
    backgroundImage: z.string().optional(),
  })
  .strict();

export const aboutProps = z
  .object({
    eyebrow,
    heading: z.string(),
    story: z.string(),
    founderName: z.string().optional(),
    founderRole: z.string().optional(),
    founderImage: z.string().optional(),
    mission: z.string().optional(),
    pullQuote: z.string().optional(),
  })
  .strict();

export const servicesProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    services: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        icon: z.string().optional(),
      }),
    ),
  })
  .strict();

export const portfolioProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    projects: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        tags: z.array(z.string()).optional(),
        link: z.string().optional(),
      }),
    ),
  })
  .strict();

export const testimonialsProps = z
  .object({
    eyebrow,
    heading: z.string(),
    testimonials: z.array(
      z.object({
        quote: z.string(),
        author: z.string(),
        role: z.string().optional(),
        company: z.string().optional(),
        avatar: z.string().optional(),
      }),
    ),
  })
  .strict();

export const contactProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    email: z.string(),
    phone: z.string().optional(),
    address: z.string().optional(),
    showForm: z.boolean().optional(),
  })
  .strict();

export const footerProps = z
  .object({
    companyName: z.string(),
    copyright: z.string(),
    navLinks: z.array(navItem),
    socialLinks: z
      .object({
        facebook: z.string().optional(),
        instagram: z.string().optional(),
        linkedin: z.string().optional(),
        twitter: z.string().optional(),
      })
      .strict(),
    tagline: z.string().optional(),
  })
  .strict();

export const faqProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    items: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    ),
  })
  .strict();

export const ctaBandProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    ctaText: z.string(),
    ctaHref: z.string(),
    variant: z.enum(["primary", "secondary", "accent"]).optional(),
  })
  .strict();

export const statsProps = z
  .object({
    eyebrow,
    heading: z.string().optional(),
    stats: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
      }),
    ),
  })
  .strict();

export const pricingProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    note: z.string().optional(),
    tiers: z.array(
      z.object({
        name: z.string(),
        price: z.string(),
        cadence: z.string().optional(),
        description: z.string().optional(),
        includes: z.array(z.string()).optional(),
        ctaText: z.string().optional(),
        ctaHref: z.string().optional(),
        featured: z.boolean().optional(),
      }),
    ),
  })
  .strict();

export const featureListProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    features: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        icon: z.string().optional(),
      }),
    ),
  })
  .strict();

export const credentialsProps = z
  .object({
    eyebrow,
    heading: z.string(),
    subheading: z.string().optional(),
    note: z.string().optional(),
    credentials: z.array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        detail: z.string().optional(),
        href: z.string().optional(),
        logo: z.string().optional(),
        icon: z.string().optional(),
      }),
    ),
  })
  .strict();

export const disclosureProps = z
  .object({
    eyebrow,
    heading: z.string().optional(),
    body: z.string(),
    links: z.array(navItem).optional(),
    variant: z.enum(["fineprint", "panel"]).optional(),
  })
  .strict();

/**
 * The closed palette. Ordered as the map lists it: the ten shipped types, then the two
 * that ticket 002 named as real gaps and ticket 003 ruled into the base package, then the
 * two that ticket 014 ranked last as the finance/advisory enabler.
 *
 * Fourteen, and closed — ruling 10 as amended 2026-09-04. The count moved; the principle
 * did not. A section type is added by an owner ruling, never by ANALYSIS.
 */
export const SECTION_PROP_SCHEMAS = {
  hero: heroProps,
  about: aboutProps,
  services: servicesProps,
  portfolio: portfolioProps,
  testimonials: testimonialsProps,
  contact: contactProps,
  footer: footerProps,
  faq: faqProps,
  "cta-band": ctaBandProps,
  stats: statsProps,
  pricing: pricingProps,
  "feature-list": featureListProps,
  credentials: credentialsProps,
  disclosure: disclosureProps,
} as const;

export const sectionTypes = Object.keys(SECTION_PROP_SCHEMAS) as [
  SectionType,
  ...SectionType[],
];

export type SectionType = keyof typeof SECTION_PROP_SCHEMAS;

/**
 * Discriminated on `type`, so a bad `hero` reports its own missing `headline` rather than
 * "no union member matched" across fourteen candidates.
 *
 * Spelled out rather than mapped over `SECTION_PROP_SCHEMAS`: `Object.entries` widens the
 * key to `string`, which collapses `type` to `unknown` for every downstream consumer.
 */
export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), props: heroProps }),
  z.object({ type: z.literal("about"), props: aboutProps }),
  z.object({ type: z.literal("services"), props: servicesProps }),
  z.object({ type: z.literal("portfolio"), props: portfolioProps }),
  z.object({ type: z.literal("testimonials"), props: testimonialsProps }),
  z.object({ type: z.literal("contact"), props: contactProps }),
  z.object({ type: z.literal("footer"), props: footerProps }),
  z.object({ type: z.literal("faq"), props: faqProps }),
  z.object({ type: z.literal("cta-band"), props: ctaBandProps }),
  z.object({ type: z.literal("stats"), props: statsProps }),
  z.object({ type: z.literal("pricing"), props: pricingProps }),
  z.object({ type: z.literal("feature-list"), props: featureListProps }),
  z.object({ type: z.literal("credentials"), props: credentialsProps }),
  z.object({ type: z.literal("disclosure"), props: disclosureProps }),
]);

export type Section = z.infer<typeof sectionSchema>;
