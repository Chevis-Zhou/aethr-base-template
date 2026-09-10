"use client";

import type { ComponentType } from "react";
import { AboutSection } from "../../components/sections/about";
import { ContactSection } from "../../components/sections/contact";
import { CredentialsSection } from "../../components/sections/credentials";
import { CTABandSection } from "../../components/sections/cta-band";
import { DisclosureSection } from "../../components/sections/disclosure";
import { FAQSection } from "../../components/sections/faq";
import { FeatureListSection } from "../../components/sections/feature-list";
import { FooterSection } from "../../components/sections/footer";
import { HeroSection } from "../../components/sections/hero";
import { PortfolioSection } from "../../components/sections/portfolio";
import { PricingSection } from "../../components/sections/pricing";
import { ServicesSection } from "../../components/sections/services";
import { StatsSection } from "../../components/sections/stats";
import { TestimonialsSection } from "../../components/sections/testimonials";
import { Header } from "../../components/layout/header";
import { Footer } from "../../components/layout/footer";
import { foregroundVars } from "../theme/derive";
import type { SectionType } from "../assembly/section-props";
import type { SiteSpec } from "../assembly/site-spec";

/**
 * The live preview's half of the shared code.
 *
 * `SECTION_REGISTRY` maps `type → import path` for code generation, which a bundler cannot
 * follow at runtime. This is the same mapping with the components themselves, and it is
 * the reason the preview cannot drift from the built site: the portal renders *these*
 * components, over the same props `assemble.ts` writes into a page file.
 *
 * Nothing here is preview-specific except `deriveNav`, which is lifted verbatim from
 * `generate.ts` so an un-navved spec previews the nav the build would have generated.
 */

/**
 * One map, fourteen prop shapes. `any` rather than a union of the fourteen component
 * types: the discriminated union is already enforced at the call site by `SiteSpec`, and a
 * union here would make every consumer cast the props back out of it.
 */
export const SECTION_COMPONENTS: Record<
  SectionType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ComponentType<any>
> = {
  hero: HeroSection,
  about: AboutSection,
  services: ServicesSection,
  portfolio: PortfolioSection,
  testimonials: TestimonialsSection,
  contact: ContactSection,
  footer: FooterSection,
  faq: FAQSection,
  "cta-band": CTABandSection,
  stats: StatsSection,
  pricing: PricingSection,
  "feature-list": FeatureListSection,
  credentials: CredentialsSection,
  disclosure: DisclosureSection,
};

export { Header as PreviewHeader, Footer as PreviewFooter };

/**
 * The twelve tokens as CSS custom properties, plus the derived foreground polarity.
 * Identical to what `app/layout.tsx` puts on `<html>` — same source, same function.
 */
export function previewTokenVars(tokens: SiteSpec["tokens"]): Record<string, string> {
  return {
    "--primary-h": tokens.primaryHue,
    "--primary-s": tokens.primarySaturation,
    "--primary-l": tokens.primaryLightness,
    "--secondary-h": tokens.secondaryHue,
    "--secondary-s": tokens.secondarySaturation,
    "--secondary-l": tokens.secondaryLightness,
    "--accent-h": tokens.accentHue,
    "--accent-s": tokens.accentSaturation,
    "--accent-l": tokens.accentLightness,
    ...foregroundVars(tokens),
    "--font-heading-family": tokens.fontHeading,
    "--font-body-family": tokens.fontBody,
    "--radius": tokens.radius,
  };
}

/** Verbatim from `generate.ts` — a spec with no `nav` previews the derived one. */
export function previewNav(spec: SiteSpec): { label: string; href: string }[] {
  if (spec.nav) return [...spec.nav];
  const nav = [{ label: "Home", href: "/" }];
  for (const page of spec.pages) {
    if (page.slug === "/") continue;
    const label = page.slug
      .replace(/^\//, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    nav.push({ label, href: page.slug });
  }
  return nav;
}

/** The Google Fonts href `app/layout.tsx` builds, so the preview loads the real faces. */
export function previewFontsHref(tokens: SiteSpec["tokens"]): string {
  const families = [...new Set([tokens.fontHeading, tokens.fontBody].filter(Boolean))];
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")}&display=swap`;
}
