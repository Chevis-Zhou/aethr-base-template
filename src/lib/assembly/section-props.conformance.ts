/**
 * Compile-time proof that every prop schema still mirrors its component's interface.
 *
 * The schemas in `section-props.ts` are hand-written beside the components rather than
 * derived from them, so nothing but this file stops the two from drifting — and a drifted
 * schema is worse than no schema, because it validates a spec that then fails at
 * `next build`, which is exactly the failure these schemas exist to prevent.
 *
 * Assignability is asserted in both directions: `schema → props` catches a schema that
 * has grown a field the component cannot accept, `props → schema` catches a component
 * that has grown a field the schema would now reject under `.strict()`. This file emits
 * no runtime code; adding a prop to a component and forgetting the schema is a `tsc`
 * error here, not a build failure three stages later.
 */
import type { z } from "zod/v4";

import type * as S from "./section-props";
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

/**
 * Structural *identity*, not mutual assignability. Mutual assignability was tried first
 * and is inert here: an extra optional field on one side satisfies `extends` in both
 * directions, so a schema that had grown a prop the component does not have passed
 * clean. This is the standard conditional-type identity trick, which does catch it.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertTrue<T extends true> = T;

// Written out per section rather than through a `Conforms<Schema, Props>` helper: inside a
// generic alias TypeScript defers `Equals` and the constraint degrades to `boolean`, which
// makes every assertion pass. Verified by negative control — see this file's history.

type _hero = AssertTrue<Equals<z.infer<typeof S.heroProps>, HeroProps>>;
type _about = AssertTrue<Equals<z.infer<typeof S.aboutProps>, AboutProps>>;
type _services = AssertTrue<Equals<z.infer<typeof S.servicesProps>, ServicesProps>>;
type _portfolio = AssertTrue<Equals<z.infer<typeof S.portfolioProps>, PortfolioProps>>;
type _testimonials = AssertTrue<Equals<z.infer<typeof S.testimonialsProps>, TestimonialsProps>>;
type _contact = AssertTrue<Equals<z.infer<typeof S.contactProps>, ContactProps>>;
type _footer = AssertTrue<Equals<z.infer<typeof S.footerProps>, FooterProps>>;
type _faq = AssertTrue<Equals<z.infer<typeof S.faqProps>, FAQProps>>;
type _ctaBand = AssertTrue<Equals<z.infer<typeof S.ctaBandProps>, CTABandProps>>;
type _stats = AssertTrue<Equals<z.infer<typeof S.statsProps>, StatsProps>>;
type _pricing = AssertTrue<Equals<z.infer<typeof S.pricingProps>, PricingProps>>;
type _featureList = AssertTrue<Equals<z.infer<typeof S.featureListProps>, FeatureListProps>>;
type _credentials = AssertTrue<Equals<z.infer<typeof S.credentialsProps>, CredentialsProps>>;
type _disclosure = AssertTrue<Equals<z.infer<typeof S.disclosureProps>, DisclosureProps>>;

/** Every registered section type has a component entry, and vice versa. */
type _paletteIsClosed = AssertTrue<
  Equals<S.SectionType, keyof typeof import("./section-registry").SECTION_REGISTRY>
>;

export type Conformance = [
  _hero,
  _about,
  _services,
  _portfolio,
  _testimonials,
  _contact,
  _footer,
  _faq,
  _ctaBand,
  _stats,
  _pricing,
  _featureList,
  _credentials,
  _disclosure,
  _paletteIsClosed,
];
