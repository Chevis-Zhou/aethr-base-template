"use client";

import { useState, type FormEvent } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { TurnstileWidget } from "../ui/turnstile";
import { mark, type EditProps } from "../../lib/edit/markers";

/**
 * Read at module scope so Next inlines it at BUILD into the static export. Empty on every
 * client whose Turnstile widget has not been created yet — see `ui/turnstile.tsx` for why
 * this is an env var rather than a `SiteSpec` field, and why an absent key must leave the
 * shipped no-token behaviour exactly as it was.
 */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export interface ContactProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  email: string;
  phone?: string;
  address?: string;
  showForm?: boolean;
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

export function ContactSection({
  eyebrow,
  heading,
  subheading,
  email,
  phone,
  address,
  showForm = true,
  edit,
}: ContactProps & EditProps) {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Turnstile tokens are single-use, so a successful send has to retire the widget.
  // Bumping this key remounts it, which is cheaper to reason about than an imperative
  // reset handle and cleans up the old widget through the component's own teardown.
  const [widgetKey, setWidgetKey] = useState(0);
  // The script being blocked or offline must not lock a visitor out of the form: the
  // Worker is the gate, and it rejects a missing token on its own terms.
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);
  const turnstileActive = Boolean(TURNSTILE_SITE_KEY) && !turnstileUnavailable;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (turnstileActive && !turnstileToken) {
      // The challenge normally resolves in about a second, so this is a "wait a moment"
      // rather than a rejection — and it is why the button is not disabled instead: a
      // permanently dead button with no explanation is the worse failure.
      setErrorMessage("Just a moment while we verify you are human, then try again.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      message: String(formData.get("message") ?? ""),
      // Omitted entirely when there is no key, so the request body is unchanged on every
      // client that has no Turnstile widget yet.
      ...(turnstileToken ? { turnstileToken } : {}),
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (result.success) {
        setStatus("success");
        form.reset();
        setTurnstileToken(null);
        setWidgetKey((key) => key + 1);
      } else {
        setTurnstileToken(null);
        setWidgetKey((key) => key + 1);
        setStatus("error");
        setErrorMessage(result.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  // `path` rides along so the canvas can address the three of them without this list
  // being restated anywhere else — they are fields, not decoration.
  const contactItems = [
    { icon: Mail, label: email, href: `mailto:${email}`, path: "email" },
    ...(phone
      ? [{ icon: Phone, label: phone, href: `tel:${phone.replace(/[^+\d]/g, "")}`, path: "phone" }]
      : []),
    ...(address
      ? [{ icon: MapPin, label: address, href: undefined as string | undefined, path: "address" }]
      : []),
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className={cn("grid gap-12", showForm && "lg:grid-cols-2 lg:gap-16")}>
          <div>
            {eyebrow && (
              <p
                className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase"
                {...mark(edit, "eyebrow")}
              >
                {eyebrow}
              </p>
            )}
            {heading && (
              <h2
                className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                {...mark(edit, "heading")}
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p className="mt-4 text-lg text-muted-foreground" {...mark(edit, "subheading", "textarea")}>
                {subheading}
              </p>
            )}

            <ul className="mt-8 space-y-4">
              {contactItems.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-foreground">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="transition-colors hover:text-primary"
                      {...mark(edit, item.path)}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span {...mark(edit, item.path)}>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground">
                    Name
                  </label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <Input id="email" name="email" type="email" required />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-foreground">
                  Phone (optional)
                </label>
                <Input id="phone" name="phone" type="tel" />
              </div>
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-foreground">
                  Message
                </label>
                <Textarea id="message" name="message" rows={5} required />
              </div>

              {TURNSTILE_SITE_KEY && (
                <TurnstileWidget
                  key={widgetKey}
                  siteKey={TURNSTILE_SITE_KEY}
                  onToken={setTurnstileToken}
                  onUnavailable={() => setTurnstileUnavailable(true)}
                />
              )}

              <Button
                type="submit"
                size="lg"
                disabled={status === "loading"}
                className="w-full sm:w-auto"
              >
                {status === "loading" ? "Sending..." : "Send Message"}
              </Button>

              {status === "success" && (
                <p className="text-sm font-medium text-primary">
                  Thanks — we&apos;ll be in touch soon.
                </p>
              )}
              {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
