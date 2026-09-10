import { HeroSection } from "@/components/sections/hero";
import { AboutSection } from "@/components/sections/about";
import { ServicesSection } from "@/components/sections/services";
import { PortfolioSection } from "@/components/sections/portfolio";
import { TestimonialsSection } from "@/components/sections/testimonials";
import { StatsSection } from "@/components/sections/stats";
import { FAQSection } from "@/components/sections/faq";
import { ContactSection } from "@/components/sections/contact";
import { CTABandSection } from "@/components/sections/cta-band";
import { FooterSection } from "@/components/sections/footer";
import { PricingSection } from "@/components/sections/pricing";
import { FeatureListSection } from "@/components/sections/feature-list";
import { CredentialsSection } from "@/components/sections/credentials";
import { DisclosureSection } from "@/components/sections/disclosure";

export const metadata = {
  title: "Section Showcase",
  robots: { index: false, follow: false },
};

export default function ShowcasePage() {
  return (
    <div>
      <div className="bg-foreground py-2 text-center text-xs font-medium text-background">
        Section Component Showcase — Development Only
      </div>

      <HeroSection
        headline="Design That Moves Your Business Forward"
        subheadline="Acme Design Studio crafts bold, conversion-focused websites for ambitious small businesses."
        ctaText="Start Your Project"
        ctaHref="#contact"
        backgroundImage="https://placehold.co/1920x1080/1a1a2e/ffffff?text=Acme+Design+Studio"
      />

      <AboutSection
        heading="Our Story"
        story={`Acme Design Studio was founded on a simple idea: small businesses deserve the same caliber of design as the big brands, without the big-agency price tag.\n\nFor the last decade we've partnered with founders, contractors, and creative studios to build websites that look sharp and convert visitors into customers.`}
        founderName="Jordan Lee"
        founderRole="Founder & Creative Director"
        founderImage="https://placehold.co/400x400/e2e8f0/1a1a2e?text=JL"
        mission="To help small businesses look as good as they perform."
      />

      <ServicesSection
        heading="What We Do"
        subheading="A focused set of services designed to get your business online and growing."
        services={[
          {
            title: "Brand Identity",
            description: "Logo, color, and typography systems that make your business memorable.",
            icon: "Palette",
          },
          {
            title: "Web Design",
            description: "Custom, responsive websites tailored to your business and audience.",
            icon: "Monitor",
          },
          {
            title: "Development",
            description: "Fast, modern, SEO-friendly builds on the latest web stack.",
            icon: "Code",
          },
          {
            title: "SEO & Growth",
            description: "On-page optimization and content strategy to grow organic traffic.",
            icon: "TrendingUp",
          },
          {
            title: "Ongoing Support",
            description: "Monthly updates, monitoring, and small content changes included.",
            icon: "Settings",
          },
          {
            title: "Brand Photography",
            description: "On-location photography that fits your new site's design language.",
          },
        ]}
      />

      <FeatureListSection
        eyebrow="Why Acme"
        heading="What Working With Us Is Actually Like"
        subheading="The differences that show up in month three, not in the pitch."
        features={[
          {
            title: "One team, start to finish",
            description:
              "The designer who drew your site is the developer who builds it and the person who answers your email afterwards.",
            icon: "Users",
          },
          {
            title: "Fixed scope, fixed price",
            description:
              "Everything is quoted before work starts. If the scope changes, you approve the change and its price before anyone opens an editor.",
            icon: "DollarSign",
          },
          {
            title: "Built to be handed over",
            description:
              "You own the domain, the accounts and the code. Nothing about leaving us is designed to be difficult.",
            icon: "Layers",
          },
          {
            title: "Speed as a design constraint",
            description:
              "Performance budgets are set at the wireframe stage rather than audited after launch, when fixing them means redrawing the page.",
            icon: "Zap",
          },
        ]}
      />

      <StatsSection
        heading="By the Numbers"
        stats={[
          { value: "120+", label: "Projects Delivered" },
          { value: "12", label: "Years in Business" },
          { value: "4.9★", label: "Average Client Rating" },
          { value: "24/7", label: "Site Monitoring" },
        ]}
      />

      <PortfolioSection
        heading="Selected Work"
        subheading="A few recent projects across industries."
        projects={[
          {
            title: "Northside Coffee Roasters",
            description: "Brand refresh and e-commerce site for a local coffee roaster.",
            image: "https://placehold.co/800x600/2563eb/ffffff?text=Coffee+Roasters",
            tags: ["Branding", "E-commerce"],
            link: "#",
          },
          {
            title: "Marlowe & Finch Law",
            description: "Professional services site with online consultation booking.",
            image: "https://placehold.co/800x600/1e293b/ffffff?text=Marlowe+%26+Finch",
            tags: ["Web Design", "Booking"],
            link: "#",
          },
          {
            title: "Apex Fitness Studio",
            description: "Class schedules, trainer bios, and membership signup flow.",
            image: "https://placehold.co/800x600/16a34a/ffffff?text=Apex+Fitness",
            tags: ["Web Design", "SEO"],
            link: "#",
          },
        ]}
      />

      <PricingSection
        eyebrow="Pricing"
        heading="What It Costs"
        subheading="Three ways to work together. Every one is quoted before work starts."
        note="Prices exclude domain registration and third-party licences, which you buy and own directly."
        tiers={[
          {
            name: "Landing Page",
            price: "$1,200",
            description: "One page, built to convert a single audience.",
            includes: ["Single responsive page", "Copy polish", "Contact form", "Two revision rounds"],
            ctaText: "Get started",
            ctaHref: "#contact",
          },
          {
            name: "Business Site",
            price: "$3,500",
            description: "The full small-business site, start to finish.",
            includes: [
              "Up to six pages",
              "Brand-matched design system",
              "SEO setup and analytics",
              "Content migration",
              "Two revision rounds",
            ],
            ctaText: "Book a call",
            ctaHref: "#contact",
            featured: true,
          },
          {
            name: "Care Plan",
            price: "$150",
            cadence: "/mo",
            description: "Hosting, monitoring and small changes after launch.",
            includes: ["Managed hosting", "Uptime monitoring", "Monthly content updates", "Priority email support"],
            ctaText: "Talk to us",
            ctaHref: "#contact",
          },
        ]}
      />

      <TestimonialsSection
        heading="What Clients Say"
        testimonials={[
          {
            quote:
              "Acme took our half-finished brand and turned it into a site we're proud to send to investors. The turnaround was faster than we expected.",
            author: "Maria Chen",
            role: "Founder",
            company: "Northside Coffee Roasters",
            avatar: "https://placehold.co/100x100/e2e8f0/1a1a2e?text=MC",
          },
          {
            quote:
              "Communication was clear from day one and the new site has already paid for itself in new client inquiries.",
            author: "David Marlowe",
            role: "Partner",
            company: "Marlowe & Finch Law",
          },
          {
            quote:
              "Our booking abandonment dropped almost immediately after launch. Exactly the kind of result we needed.",
            author: "Priya Anand",
            role: "Studio Manager",
            company: "Apex Fitness Studio",
            avatar: "https://placehold.co/100x100/e2e8f0/1a1a2e?text=PA",
          },
        ]}
      />

      <CredentialsSection
        eyebrow="Verify us"
        heading="Credentials You Can Check"
        subheading="Each of these is on a public register. The links go to the register, not to a page we wrote."
        note="Listing on any directory or partner programme does not imply endorsement by that organisation."
        credentials={[
          {
            name: "Google Partner",
            issuer: "Google",
            detail: "Agency ID 000-000-0000 · renewed 2026",
            href: "https://www.google.com/partners/",
            icon: "BadgeCheck",
          },
          {
            name: "Registered Business Entity",
            issuer: "California Secretary of State",
            detail: "Entity #C0000000 · in good standing",
            href: "https://bizfileonline.sos.ca.gov/search/business",
            icon: "Shield",
          },
          {
            name: "Best Small Web Studio, 2025",
            issuer: "Bay Area Design Awards",
            detail: "Category: small business websites",
            icon: "Award",
          },
        ]}
      />

      <FAQSection
        heading="Frequently Asked Questions"
        subheading="Everything you need to know before getting started."
        items={[
          {
            question: "How long does a typical project take?",
            answer:
              "Most projects launch within 2–4 weeks of kickoff, depending on scope and how quickly we receive content and feedback.",
          },
          {
            question: "Do you offer ongoing support after launch?",
            answer:
              "Yes — every site includes a maintenance plan covering hosting, monitoring, and small content updates.",
          },
          {
            question: "Can you work with our existing brand?",
            answer:
              "Absolutely. We can build within your current brand guidelines or help refresh them as part of the project.",
          },
          {
            question: "What platforms do you build on?",
            answer:
              "We build on a modern, fast, SEO-friendly stack designed for long-term flexibility and performance.",
          },
          {
            question: "How do payments work?",
            answer:
              "Projects are split into a deposit and a final payment on delivery. Ongoing plans are billed monthly.",
          },
        ]}
      />

      <ContactSection
        heading="Let's Talk"
        subheading="Tell us about your project and we'll get back to you within one business day."
        email="hello@acmedesignstudio.com"
        phone="+1 (555) 010-2030"
        address="123 Market St, Suite 400, San Francisco, CA"
      />

      <CTABandSection
        heading="Ready to get started?"
        subheading="Book a free 20-minute consultation — no pressure, just a conversation about your project."
        ctaText="Book a Call"
        ctaHref="#contact"
        variant="accent"
      />

      <DisclosureSection
        heading="Terms and disclosures"
        body={`Acme Design Studio LLC is a design and development studio. Nothing on this page is a binding offer; all engagements are governed by a signed statement of work.\n\nProject timelines quoted here are typical rather than guaranteed and depend on the client supplying content and feedback. Figures shown in the case studies above describe past engagements and are not a prediction of results.\n\nClients own their domain, hosting accounts and delivered source code. Third-party licences — fonts, stock imagery, plugins — are purchased in the client's name and remain the client's property.`}
        links={[
          { label: "Terms of Service", href: "#" },
          { label: "Privacy Policy", href: "#" },
          { label: "Accessibility Statement", href: "#" },
        ]}
      />

      <FooterSection
        companyName="Acme Design Studio"
        tagline="Design that performs."
        copyright="© 2026 Acme Design Studio. All rights reserved."
        navLinks={[
          { label: "Privacy Policy", href: "#" },
          { label: "Terms of Service", href: "#" },
        ]}
        socialLinks={{
          facebook: "https://facebook.com",
          instagram: "https://instagram.com",
          linkedin: "https://linkedin.com",
          twitter: "",
        }}
      />
    </div>
  );
}
