import { z } from "zod/v4";

export const sectionTypes = [
  "hero",
  "about",
  "services",
  "portfolio",
  "testimonials",
  "contact",
  "footer",
  "faq",
  "cta-band",
  "stats",
] as const;

export type SectionType = (typeof sectionTypes)[number];

const socialSchema = z.object({
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  twitter: z.string().optional(),
});

const clientSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  bookingUrl: z.string().optional(),
  social: socialSchema.optional().default({}),
});

const tokensSchema = z.object({
  primaryHue: z.string(),
  primarySaturation: z.string(),
  primaryLightness: z.string(),
  secondaryHue: z.string(),
  secondarySaturation: z.string(),
  secondaryLightness: z.string(),
  accentHue: z.string(),
  accentSaturation: z.string(),
  accentLightness: z.string(),
  fontHeading: z.string(),
  fontBody: z.string(),
  radius: z.string(),
});

const sectionSchema = z.object({
  type: z.enum(sectionTypes),
  props: z.record(z.string(), z.unknown()),
});

const pageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(sectionSchema).min(1),
});

const seoSchema = z.object({
  siteName: z.string(),
  defaultImage: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const siteSpecSchema = z
  .object({
    client: clientSchema,
    tokens: tokensSchema,
    pages: z.array(pageSchema),
    seo: seoSchema,
    nav: z.array(navItemSchema).optional(),
  })
  .check(
    (ctx) => {
      if (!ctx.value.pages.some((p) => p.slug === "/")) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value.pages,
          message: "At least one page must have slug '/'",
          path: ["pages"],
        });
      }
    },
  );

export type SiteSpec = z.infer<typeof siteSpecSchema>;
