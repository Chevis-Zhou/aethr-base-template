import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { clientConfig } from "@/lib/client-config";
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
    "--font-heading-family": tokens.fontHeading,
    "--font-body-family": tokens.fontBody,
    "--radius": tokens.radius,
  };

  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      style={tokenStyles as React.CSSProperties}
    >
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
