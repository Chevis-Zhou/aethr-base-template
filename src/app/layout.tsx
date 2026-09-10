import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { clientConfig } from "@/lib/client-config";
import { foregroundVars } from "@/lib/theme/derive";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: clientConfig.name,
  description: clientConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { tokens } = clientConfig;

  const tokenStyles: Record<string, string> = {
    "--primary-h": tokens.primaryHue,
    "--primary-s": tokens.primarySaturation,
    "--primary-l": tokens.primaryLightness,
    "--secondary-h": tokens.secondaryHue,
    "--secondary-s": tokens.secondarySaturation,
    "--secondary-l": tokens.secondaryLightness,
    "--accent-h": tokens.accentHue,
    "--accent-s": tokens.accentSaturation,
    "--accent-l": tokens.accentLightness,
    // Foreground polarity, derived from the three surfaces rather than fixed per role —
    // see src/lib/theme/derive.ts.
    ...foregroundVars(tokens),
    "--font-heading-family": tokens.fontHeading,
    "--font-body-family": tokens.fontBody,
    "--radius": tokens.radius,
  };

  // The token pair above only names the faces — without this nothing fetches them and
  // every generated site silently falls back. Deduped so a spec reusing one family
  // for both slots doesn't request it twice.
  const googleFontsHref = `https://fonts.googleapis.com/css2?${[
    ...new Set([tokens.fontHeading, tokens.fontBody].filter(Boolean)),
  ]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")}&display=swap`;

  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      style={tokenStyles as React.CSSProperties}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={googleFontsHref} />
      </head>
      <body className="flex min-h-full flex-col">
        <Header siteName={clientConfig.name} nav={clientConfig.nav} />
        <main className="flex-1">{children}</main>
        <Footer
          companyName={clientConfig.name}
          tagline={clientConfig.tagline}
          copyright={clientConfig.footer.copyright}
          navLinks={[...clientConfig.footer.links]}
          socialLinks={clientConfig.social}
        />
      </body>
    </html>
  );
}
