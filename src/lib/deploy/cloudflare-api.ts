/**
 * Thin wrapper over the Cloudflare REST API v4 — the calls `wrangler` doesn't cover:
 * zone creation, Turnstile widgets, and rulesets (rate limiting, response-header
 * transforms). `wrangler` itself remains the client for anything it does own (deploy,
 * rollback, secrets) — see `deploy.ts` and `zone-setup.ts`'s use of `run()`.
 *
 * Every call site passes `dryRun` explicitly and supplies a `fake` result for that mode,
 * so a caller can be exercised end to end — including whatever it does with the id a real
 * call would have returned — without a token, an account, or a network call. Nothing here
 * decides whether a live call is safe to make; that judgment stays with the caller and,
 * per the deploy spec, with Chevis on every single command.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

interface CfListError {
  code: number;
  message: string;
}

interface CfEnvelope<T> {
  success: boolean;
  errors: CfListError[];
  result: T;
}

export class CloudflareApiError extends Error {
  constructor(method: string, urlPath: string, errors: CfListError[]) {
    super(
      `Cloudflare API ${method} ${urlPath} failed: ` +
        (errors.length ? errors.map((e) => `[${e.code}] ${e.message}`).join("; ") : "no error detail returned"),
    );
    this.name = "CloudflareApiError";
  }
}

function indentJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
}

export interface CfCallOptions<T> {
  dryRun: boolean;
  body?: unknown;
  /** What to return in dry-run mode, in place of a real response. Never sent anywhere. */
  fake: T;
}

/**
 * `accountId` is read here, not by callers, so a dry-run needs no env var at all — it
 * prints the placeholder and moves on. A live call fails loudly if either is missing
 * rather than sending a request with `undefined` baked into the URL or body.
 *
 * Zone-setup and transform-rule read `AETHR_CLOUDFLARE_*` from `.env` so the names
 * wrangler auto-loads (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`) stay absent.
 * A token in those wrangler names turns `wrangler deploy` into auth error 10000 *after*
 * the asset upload — the same trap tasteled's `env -u` exists for. Fall back to the
 * unprefixed names so a one-off export still works.
 */
export function cloudflareAccountId(): string | undefined {
  return process.env.AETHR_CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
}

export function cloudflareApiToken(): string | undefined {
  return process.env.AETHR_CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
}

export function requireAccountId(dryRun: boolean): string {
  if (dryRun) return "<CLOUDFLARE_ACCOUNT_ID>";
  const id = cloudflareAccountId();
  if (!id) {
    throw new Error(
      "AETHR_CLOUDFLARE_ACCOUNT_ID is not set — required for a live Cloudflare call.",
    );
  }
  return id;
}

export async function cf<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  urlPath: string,
  opts: CfCallOptions<T>,
): Promise<T> {
  const label = `${method} ${CF_API}${urlPath}`;
  if (opts.dryRun) {
    console.log(`  [dry-run] ${label}` + (opts.body ? `\n${indentJson(opts.body)}` : ""));
    return opts.fake;
  }

  const apiToken = cloudflareApiToken();
  if (!apiToken) {
    throw new Error(
      "AETHR_CLOUDFLARE_API_TOKEN is not set — required for a live Cloudflare call.",
    );
  }

  console.log(`  $ ${label}`);
  const res = await fetch(`${CF_API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as CfEnvelope<T>;
  if (!json.success) {
    throw new CloudflareApiError(method, urlPath, json.errors);
  }
  return json.result;
}

export interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  environment?: string;
  zone_id?: string;
  zone_name?: string;
}

/**
 * GET /accounts/{id}/workers/domains?service=site-<slug>
 *
 * The list wrangler will reconcile against. Staging reads this before writing
 * config so a re-stage cannot drop production Custom Domains; deploy re-reads
 * it after wrangler exits because wrangler's exit code does not mean the
 * attach stuck.
 */
export async function listWorkerDomains(service: string, dryRun: boolean): Promise<WorkerDomain[]> {
  const accountId = requireAccountId(dryRun);
  const result = await cf<WorkerDomain[]>(
    "GET",
    `/accounts/${accountId}/workers/domains?service=${encodeURIComponent(service)}`,
    { dryRun, fake: [] },
  );
  return Array.isArray(result) ? result : [];
}
