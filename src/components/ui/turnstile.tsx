"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, the client half.
 *
 * The Worker (`src/worker.ts`) has verified tokens since the deploy work landed and
 * **fails closed** — if `TURNSTILE_SECRET_KEY` is set and no valid token arrives, the
 * submission is rejected. Until this component existed, setting that secret on any client
 * rejected every legitimate submission, so the secret could not be set at all. This is
 * the piece that unblocks it.
 *
 * **The site key is a build-time env var, not a spec field.** It is public by design
 * (Cloudflare's own docs put it in the markup), and it is *infrastructure*, not content:
 * it does not exist at ANALYSIS time — the widget is created during the per-client zone
 * setup runbook, long after the spec is written and approved. Routing it through
 * `SiteSpec` would put a value nobody has yet into the document a human approves, and
 * would change `ContactProps`, the contact schema and `SPEC-FORMAT.md` for something no
 * client ever authors. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is read at BUILD and inlined into
 * the static export.
 *
 * **Absent key means absent widget.** With no key baked in, `contact.tsx` renders nothing
 * here and posts without a token — byte-for-byte the behaviour that shipped — and the
 * Worker, having no secret either, accepts. The two halves are enabled together or not at
 * all, which is the whole point.
 *
 * Explicit rendering (`render=explicit` plus an `onload` callback) rather than the
 * implicit `.cf-turnstile` class scan: implicit mode scans the DOM once when the script
 * loads, which races React's first paint and never re-scans a widget that mounts later.
 */

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  theme?: "auto" | "light" | "dark";
  action?: string;
}

interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onloadTurnstileCallback?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback";

/**
 * Module-level so two Turnstile widgets on one page share one script load and one
 * `onload`. Nulled on failure so a later mount can retry rather than waiting forever on a
 * promise that will never settle.
 */
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    window.onloadTurnstileCallback = () => resolve();
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  /** Called with the token on success, and with `null` when it expires, errors or resets. */
  onToken: (token: string | null) => void;
  /** Called once if the script itself cannot load — a blocked or offline visitor. */
  onUnavailable?: () => void;
  className?: string;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onUnavailable,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the render effect depends only on `siteKey`. Depending on the
  // callbacks directly would tear down and re-render the widget on every parent render,
  // which drops a token the visitor has already earned.
  const onTokenRef = useRef(onToken);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onTokenRef.current = onToken;
    onUnavailableRef.current = onUnavailable;
  });

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) onUnavailableRef.current?.();
      });

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={containerRef} className={className} />;
}
