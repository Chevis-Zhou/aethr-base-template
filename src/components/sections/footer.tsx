import Link from "next/link";

export interface FooterProps {
  companyName: string;
  copyright: string;
  navLinks: { label: string; href: string }[];
  socialLinks: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
  };
  tagline?: string;
}

// Lucide dropped brand icons — inline SVGs for social platforms
const SOCIAL_ICONS: Record<string, { label: string; path: string }> = {
  facebook: {
    label: "Facebook",
    path: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  },
  instagram: {
    label: "Instagram",
    path: "M16 4H8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4zm-4 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3.5-7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
  },
  linkedin: {
    label: "LinkedIn",
    path: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  },
  twitter: {
    label: "X / Twitter",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
};

export function FooterSection({
  companyName,
  copyright,
  navLinks,
  socialLinks,
  tagline,
}: FooterProps) {
  const activeSocials = Object.entries(socialLinks).filter(([, url]) => url) as [
    string,
    string,
  ][];

  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-heading text-xl font-bold">{companyName}</p>
            {tagline && <p className="mt-2 text-sm text-background/70">{tagline}</p>}
          </div>

          {navLinks.length > 0 && (
            <nav className="flex flex-wrap gap-x-8 gap-y-2">
              {navLinks.map((link, i) => (
                <Link
                  key={`${link.label}-${i}`}
                  href={link.href}
                  className="text-sm text-background/70 transition-colors hover:text-background"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {activeSocials.length > 0 && (
            <div className="flex items-center gap-4">
              {activeSocials.map(([platform, url]) => {
                const icon = SOCIAL_ICONS[platform];
                if (!icon) return null;
                return (
                  <Link
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-background/70 transition-colors hover:text-background"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d={icon.path} />
                    </svg>
                    <span className="sr-only">{icon.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-background/10 pt-8">
          <p className="text-sm text-background/60">{copyright}</p>
        </div>
      </div>
    </footer>
  );
}
