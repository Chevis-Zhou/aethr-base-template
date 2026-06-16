"use client";

import { useState, type FormEvent } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ContactProps {
  heading: string;
  subheading?: string;
  email: string;
  phone?: string;
  address?: string;
  showForm?: boolean;
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

export function ContactSection({
  heading,
  subheading,
  email,
  phone,
  address,
  showForm = true,
}: ContactProps) {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      message: String(formData.get("message") ?? ""),
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
      } else {
        setStatus("error");
        setErrorMessage(result.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  const contactItems = [
    { icon: Mail, label: email, href: `mailto:${email}` },
    ...(phone ? [{ icon: Phone, label: phone, href: `tel:${phone.replace(/[^+\d]/g, "")}` }] : []),
    ...(address ? [{ icon: MapPin, label: address, href: undefined as string | undefined }] : []),
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className={cn("grid gap-12", showForm && "lg:grid-cols-2 lg:gap-16")}>
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {heading}
            </h2>
            {subheading && <p className="mt-4 text-lg text-muted-foreground">{subheading}</p>}

            <ul className="mt-8 space-y-4">
              {contactItems.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-foreground">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  {item.href ? (
                    <a href={item.href} className="transition-colors hover:text-primary">
                      {item.label}
                    </a>
                  ) : (
                    <span>{item.label}</span>
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
