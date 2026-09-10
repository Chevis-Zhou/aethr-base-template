export const clientConfig = {
  name: "Maxematics",
  tagline: "Private one-on-one tutoring with Max Schwarzkopf.",
  description: "One-on-one tutoring in math, science, language and test prep, in Tampa or over video.",

  email: "maxematics@icloud.com",
  phone: "813.444.6199",
  address: "Tampa, FL — virtual or in person",
  bookingUrl: "",

  social: {
    facebook: "",
    instagram: "",
    linkedin: "",
    twitter: "",
  },

  tokens: {
    primaryHue: "262.5",
    primarySaturation: "76.4%",
    primaryLightness: "55%",
    secondaryHue: "262",
    secondarySaturation: "22%",
    secondaryLightness: "26%",
    accentHue: "262",
    accentSaturation: "85%",
    accentLightness: "72%",
    fontHeading: "Inter",
    fontBody: "Inter",
    radius: "0.5rem",
  },

  nav: [
    { label: "About", href: "#about" },
    { label: "Topics", href: "#services" },
    { label: "Rates", href: "#pricing" },
    { label: "Contact", href: "#contact" },
  ],

  footer: {
    copyright: "© 2026 Maxematics. All rights reserved.",
    links: [] as { label: string; href: string }[],
  },
} as const;

export type ClientConfig = typeof clientConfig;
