import { BadgeCheck, ExternalLink } from "lucide-react";
import { resolveIcon } from "./icon-map";

export interface CredentialsProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  note?: string;
  credentials: {
    name: string;
    issuer?: string;
    detail?: string;
    href?: string;
    logo?: string;
    icon?: string;
  }[];
}

/**
 * Third-party backing — licences, certifications, registrations, memberships, awards.
 *
 * Industry-neutral by construction, per 014's "there is no finance component": the shape
 * is *a claim, who issued it, and how to check it*, which is the same shape for a CFP®
 * mark, a state contractor licence, a Google Partner badge and a bar admission. Industry
 * specificity lives in archetypes and templates, never here.
 *
 * `href` is the load-bearing field and the reason this is not a `stats` row: an
 * unverifiable credential is a claim, and the whole value of the section is that a
 * visitor can click through to the issuer's own register. It stays optional because plenty
 * of real credentials have no public lookup.
 */
export function CredentialsSection({
  eyebrow,
  heading,
  subheading,
  note,
  credentials,
}: CredentialsProps) {
  return (
    <section className="border-y border-border bg-muted/30 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {heading}
            </h2>
          )}
          {subheading && <p className="mt-4 text-lg text-muted-foreground">{subheading}</p>}
        </div>

        <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((credential) => {
            // A credential with no logo falls back to BadgeCheck rather than the shared
            // Sparkles default — Sparkles reads as decoration, which is the opposite of
            // what this section is claiming.
            const Icon = resolveIcon(credential.icon, BadgeCheck);
            return (
              <li
                key={credential.name}
                className="flex gap-4 rounded-lg border border-border bg-background p-5"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {credential.logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- arbitrary client-supplied image URLs, no fixed remote-pattern allowlist across 30+ sites */
                    <img
                      src={credential.logo}
                      alt={credential.issuer ? `${credential.issuer} mark` : credential.name}
                      className="h-11 w-11 rounded-md object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="font-heading font-semibold text-foreground">{credential.name}</p>
                  {credential.issuer && (
                    <p className="mt-1 text-sm text-muted-foreground">{credential.issuer}</p>
                  )}
                  {credential.detail && (
                    <p className="mt-1 text-sm text-muted-foreground">{credential.detail}</p>
                  )}
                  {credential.href && (
                    <a
                      href={credential.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Verify
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {note && (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">{note}</p>
        )}
      </div>
    </section>
  );
}
