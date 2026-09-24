/**
 * The change runner's calls into the portal's admin API — `aethr-portal`
 * `src/app/api/admin/{spec,change-passes}/route.ts`.
 *
 * Two credentials, both from the environment, neither ever printed:
 *
 * - `INTAKE_ADMIN_SECRET` — the bearer every `/api/admin/*` route checks.
 * - `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET` — a Cloudflare Access **service
 *   token**. `/api/admin/*` on `portal.aethrdesign.com` sits behind Access (armed
 *   2026-09-09), which answers a request without these with a 302 to the login page. On
 *   `app.tasteled.com` the same paths 404 by design (ticket 024), so the default base is
 *   the bespoke host regardless of which book the client is on.
 */

export interface PortalOptions {
  base: string;
  /** Print what would be sent; send nothing. */
  offline: boolean;
}

export const DEFAULT_PORTAL_BASE = "https://portal.aethrdesign.com";

export interface LiveSpec {
  slug: string;
  version: number;
  kind: "spec" | "annotated";
  author: string;
  createdAt: string;
  spec: unknown;
  draft: { baseVersion: number; kind: string; updatedAt: string; spec: unknown } | null;
}

export interface PortalPass {
  id: string;
  slug: string | null;
  client_reference: string | null;
  klass: "minor" | "major" | null;
  quantity: number;
  amount_cents: number;
  currency: string;
  payment_ref: string;
  customer_email: string | null;
  status: "paid" | "closed";
  paid_at: string;
  closed_version: number | null;
}

export interface PortalRequest {
  id: string;
  action: string;
  target: string;
  label: string;
  klass: string;
  price_cents: number;
  note: string | null;
  status: string;
  pass_id: string | null;
  created_at: string;
}

function headers(): Record<string, string> {
  const secret = process.env.INTAKE_ADMIN_SECRET;
  if (!secret) throw new Error("INTAKE_ADMIN_SECRET is not set — the portal admin API needs it.");
  const out: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (id && accessSecret) {
    out["CF-Access-Client-Id"] = id;
    out["CF-Access-Client-Secret"] = accessSecret;
  }
  return out;
}

async function call<T>(opts: PortalOptions, method: "GET" | "POST", route: string, body?: unknown): Promise<T> {
  if (opts.offline) throw new Error(`Offline — refusing ${method} ${route}. Drop --offline / --dry-run.`);
  const url = `${opts.base}${route}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
    // Access answers with a redirect to its login page. Followed, that is a 200 of HTML,
    // which would then fail as a JSON parse error that names nothing useful.
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `${method} ${url} was redirected (${res.status} → ${res.headers.get("location") ?? "?"}).\n` +
        `That is Cloudflare Access in front of /api/admin/*. Set CF_ACCESS_CLIENT_ID and ` +
        `CF_ACCESS_CLIENT_SECRET to a service token the Access policy allows, or pass ` +
        `--portal-base http://localhost:3000 against a local portal.`,
    );
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export async function getLiveSpec(opts: PortalOptions, slug: string): Promise<LiveSpec> {
  return call<LiveSpec>(opts, "GET", `/api/admin/spec?slug=${encodeURIComponent(slug)}`);
}

export async function getPasses(
  opts: PortalOptions,
  slug?: string,
): Promise<{ passes: PortalPass[]; requests?: PortalRequest[] }> {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : "";
  return call(opts, "GET", `/api/admin/change-passes${query}`);
}

export async function bindPass(opts: PortalOptions, id: string, slug: string): Promise<PortalPass> {
  return (await call<{ pass: PortalPass }>(opts, "POST", "/api/admin/change-passes", { action: "bind", id, slug })).pass;
}

export async function recordManualPass(
  opts: PortalOptions,
  input: { slug: string; klass: "minor" | "major"; quantity: number; amountCents: number; paymentRef: string },
): Promise<PortalPass> {
  return (await call<{ pass: PortalPass }>(opts, "POST", "/api/admin/change-passes", { action: "record", ...input })).pass;
}

/** What a seed carries, per carrier — the admin route reads the pair for a hand-built site. */
export type SeedDocument =
  | { kind: "spec"; spec: unknown }
  | { kind: "annotated"; content: unknown; template: string; assetBase?: string };

/** The hand-off that makes the pass the live document (012 §6: post-launch it is cloud-owned). */
export async function seedDocument(
  opts: PortalOptions,
  slug: string,
  document: SeedDocument,
  note: string,
): Promise<number> {
  if (opts.offline) {
    console.log(`  [offline] would POST ${opts.base}/api/admin/spec — ${slug} (${document.kind}), note "${note}"`);
    return -1;
  }
  const body =
    document.kind === "spec"
      ? { slug, spec: document.spec, note }
      : { slug, content: document.content, template: document.template, assetBase: document.assetBase, note };
  return (await call<{ version: number }>(opts, "POST", "/api/admin/spec", body)).version;
}

/**
 * The ending for a pass that never shipped — ticket 031 §3. `closePass` records a version;
 * this records that there is none, and unlocks the editor anyway.
 */
export async function abandonPass(opts: PortalOptions, id: string, reason: string): Promise<PortalPass | null> {
  if (opts.offline) {
    console.log(`  [offline] would POST ${opts.base}/api/admin/change-passes — abandon ${id} (${reason})`);
    return null;
  }
  return (await call<{ pass: PortalPass }>(opts, "POST", "/api/admin/change-passes", { action: "abandon", id, reason })).pass;
}

export async function closePass(opts: PortalOptions, id: string, version: number): Promise<PortalPass | null> {
  if (opts.offline) {
    console.log(`  [offline] would POST ${opts.base}/api/admin/change-passes — close ${id} at v${version}`);
    return null;
  }
  return (await call<{ pass: PortalPass }>(opts, "POST", "/api/admin/change-passes", { action: "close", id, version })).pass;
}
