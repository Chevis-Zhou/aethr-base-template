export const clientConfig = {
  name: "Client Name",
  tagline: "Your tagline here",
  description: "Meta description for SEO",

  email: "contact@example.com",
  phone: "",
  address: "",
  bookingUrl: "",

  social: {
    facebook: "",
    instagram: "",
    linkedin: "",
    twitter: "",
  },

  // Design tokens — injected as CSS custom properties on <html>
  tokens: {
    primaryHue: "220",
    primarySaturation: "70%",
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

  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Contact", href: "/contact" },
  ],

  footer: {
    copyright: "© 2026 Client Name. All rights reserved.",
    links: [] as { label: string; href: string }[],
  },
} as const;

export type ClientConfig = typeof clientConfig;
