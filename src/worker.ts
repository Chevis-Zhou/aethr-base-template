/**
 * The one dynamic route on a client site.
 *
 * Everything else in a generated site is a static asset, served by Cloudflare without
 * invoking anything. `run_worker_first: ["/api/contact"]` in `wrangler.jsonc` means this
 * script runs for exactly one path, so a page view, an image or a script is a free asset
 * hit that never touches the account-wide 100,000-requests/day Worker budget shared by
 * every client, the portal and the apex proxy.
 *
 * Same-origin by design: the form posts to `clientname.com/api/contact`, not to a shared
 * `forms.aethrdesign.com`. A shared endpoint would be one fewer moving part but puts a
 * cross-origin request to a vendor domain in every client's network tab, needs a CORS
 * allowlist, and creates one component whose failure breaks every client's form at once.
 * This script is per-client and fails alone.
 *
 * Spec: `docs/wayfinder-product/assets/deploy-specification.md` §3.
 */

interface Env {
  /** Static-asset binding. Reached only if this script is invoked off its one route. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Per-client `[vars]` entry — where this client's inquiries go. */
  CONTACT_EMAIL: string;
  /** One shared AethrDesign `wrangler secret`, set at first deploy. */
  RESEND_API_KEY?: string;
  /**
   * Per-client Turnstile secret. Verification is enforced whenever this is set, and
   * fails closed — see the note below.
   */
  TURNSTILE_SECRET_KEY?: string;
}

interface ContactPayload {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  turnstileToken?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fail(error: string, status: number): Response {
  return json({ success: false, error }, status);
}

/**
 * Turnstile is the only thing standing between a spam flood on one client's form and the
 * account-wide request cap — the one failure mode where client sites can take each other,
 * the portal and checkout down together. So verification **fails closed**: if the secret
 * is configured and the check errors or the token is missing, the submission is rejected.
 * A client deployed before their Turnstile keys exist has no secret set and skips the
 * check entirely, which is the only way this is ever bypassed.
 */
async function turnstilePassed(
  token: string | undefined,
  secret: string,
  ip: string | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
  }

  let body: ContactPayload;
  try {
    body = (await request.json()) as ContactPayload;
  } catch {
    return fail("Invalid request body.", 400);
  }

  const { name, email, phone, message, turnstileToken } = body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return fail("Name, email, and message are required.", 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    return fail("Please provide a valid email address.", 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const ip = request.headers.get("cf-connecting-ip");
    if (!(await turnstilePassed(turnstileToken, env.TURNSTILE_SECRET_KEY, ip))) {
      return fail("Could not verify that you are human. Please try again.", 403);
    }
  }

  // No key configured: accept and log rather than 500, so a preview deploy can be
  // exercised end to end before secrets are attached. Mirrors the route this replaced.
  if (!env.RESEND_API_KEY) {
    console.log("[contact] RESEND_API_KEY not set — logging submission instead of sending.", {
      name,
      email,
      phone,
      message,
    });
    return json({ success: true });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "Contact Form <onboarding@resend.dev>",
        to: env.CONTACT_EMAIL,
        reply_to: email,
        subject: `New inquiry from ${name}`,
        text: [`Name: ${name}`, `Email: ${email}`, phone ? `Phone: ${phone}` : null, "", message]
          .filter((line): line is string => line !== null)
          .join("\n"),
      }),
    });

    if (!res.ok) {
      return fail("Failed to send message. Please try again.", 502);
    }
    return json({ success: true });
  } catch {
    return fail("Failed to send message. Please try again.", 500);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") {
      return handleContact(request, env);
    }
    // Unreachable under the shipped `run_worker_first`, but a config typo should serve the
    // site rather than a blank 404 from a Worker that thinks it owns every route.
    return env.ASSETS.fetch(request);
  },
};

export default worker;
