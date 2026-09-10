/**
 * The section prop types, in one place.
 *
 * This barrel sat at ten of fourteen for two batches — nothing imports it, so nothing
 * broke, and it drifted silently. The flat re-export list below is what rotted; the map
 * under it is what stops it happening again. `SectionPropsByType` is declared as
 * `Record<SectionType, unknown>`, so a section type added to the palette without a row
 * here is a `tsc` error rather than a list that is quietly one short.
 *
 * The palette itself is guarded elsewhere and differently: `section-props.conformance.ts`
 * proves each Zod schema is structurally identical to its component's interface, and that
 * `SECTION_REGISTRY` covers exactly the same keys.
 */
import type { SectionType } from "@/lib/assembly/section-props";

import type { HeroProps } from "@/components/sections/hero";
import type { AboutProps } from "@/components/sections/about";
import type { ServicesProps } from "@/components/sections/services";
import type { PortfolioProps } from "@/components/sections/portfolio";
import type { TestimonialsProps } from "@/components/sections/testimonials";
import type { ContactProps } from "@/components/sections/contact";
import type { FooterProps } from "@/components/sections/footer";
import type { FAQProps } from "@/components/sections/faq";
import type { CTABandProps } from "@/components/sections/cta-band";
import type { StatsProps } from "@/components/sections/stats";
import type { PricingProps } from "@/components/sections/pricing";
import type { FeatureListProps } from "@/components/sections/feature-list";
import type { CredentialsProps } from "@/components/sections/credentials";
import type { DisclosureProps } from "@/components/sections/disclosure";

export type {
  HeroProps,
  AboutProps,
  ServicesProps,
  PortfolioProps,
  TestimonialsProps,
  ContactProps,
  FooterProps,
  FAQProps,
  CTABandProps,
  StatsProps,
  PricingProps,
  FeatureListProps,
  CredentialsProps,
  DisclosureProps,
};

/**
 * Spec `type` → that section's props.
 *
 * The first version of this was `interface SectionPropsByType extends Record<SectionType,
 * unknown>` and was **inert** — an interface does not have to redeclare the members of
 * what it extends, it inherits them, so a deleted row silently resolved to `unknown` and
 * `tsc` stayed green. Mapping over `SectionType` and indexing into the raw table is what
 * actually catches it: a missing key makes `SectionProps[K]` an error on the lookup.
 * Verified by deleting a row and watching the build fail.
 */
interface SectionProps {
  hero: HeroProps;
  about: AboutProps;
  services: ServicesProps;
  portfolio: PortfolioProps;
  testimonials: TestimonialsProps;
  contact: ContactProps;
  footer: FooterProps;
  faq: FAQProps;
  "cta-band": CTABandProps;
  stats: StatsProps;
  pricing: PricingProps;
  "feature-list": FeatureListProps;
  credentials: CredentialsProps;
  disclosure: DisclosureProps;
}

export type SectionPropsByType = { [K in SectionType]: SectionProps[K] };

export type PropsFor<T extends SectionType> = SectionPropsByType[T];
