import type { SectionType } from "./site-spec";

export interface SectionMeta {
  importPath: string;
  componentName: string;
}

export const SECTION_REGISTRY: Record<SectionType, SectionMeta> = {
  hero: {
    importPath: "@/components/sections/hero",
    componentName: "HeroSection",
  },
  about: {
    importPath: "@/components/sections/about",
    componentName: "AboutSection",
  },
  services: {
    importPath: "@/components/sections/services",
    componentName: "ServicesSection",
  },
  portfolio: {
    importPath: "@/components/sections/portfolio",
    componentName: "PortfolioSection",
  },
  testimonials: {
    importPath: "@/components/sections/testimonials",
    componentName: "TestimonialsSection",
  },
  contact: {
    importPath: "@/components/sections/contact",
    componentName: "ContactSection",
  },
  footer: {
    importPath: "@/components/sections/footer",
    componentName: "FooterSection",
  },
  faq: {
    importPath: "@/components/sections/faq",
    componentName: "FAQSection",
  },
  "cta-band": {
    importPath: "@/components/sections/cta-band",
    componentName: "CTABandSection",
  },
  stats: {
    importPath: "@/components/sections/stats",
    componentName: "StatsSection",
  },
  pricing: {
    importPath: "@/components/sections/pricing",
    componentName: "PricingSection",
  },
  "feature-list": {
    importPath: "@/components/sections/feature-list",
    componentName: "FeatureListSection",
  },
  credentials: {
    importPath: "@/components/sections/credentials",
    componentName: "CredentialsSection",
  },
  disclosure: {
    importPath: "@/components/sections/disclosure",
    componentName: "DisclosureSection",
  },
};
