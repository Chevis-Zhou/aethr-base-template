/**
 * Per-client zone setup — deploy spec part 4, turned from a by-hand runbook into code.
 * Runbook of record: `SPEC.md`, "Runbook — per-client zone setup (part 4, by hand)".
 *
 * Every step here changes a live Cloudflare account, so every step is `--dry-run` by
 * default and prints exactly the call it would make. Live execution needs `--live`
 * *and* `AETHR_CLOUDFLARE_API_TOKEN` / `AETHR_CLOUDFLARE_ACCOUNT_ID` — and per the deploy spec, each
 * command in this runbook is still asked about individually before it runs live. This
 * module does not decide that; it only makes each step provable ahead of the decision.
 *
 * What this does NOT do, on purpose:
 * - The client's own nameserver change. `addZone` only creates the zone and returns the
 *   nameservers to hand the client (or use with temporary registrar access) — the
 *   registrar-side step has no Cloudflare API and stays a human action.
 * - Rebuild or restage the site. A Turnstile widget's site key is a BUILD input
 *   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`); if this is the client's *first* zone setup before
 *   any build baked in a site key, the site must be rebuilt and re-staged after this runs
 *   — this script prints that reminder, it doesn't act on it.
 */

import { workerName, previewHostname } from "./wrangler-config";
import { run } from "./deploy";
import { cf, requireAccountId } from "./cloudflare-api";

export interface AddZoneResult {
  zoneId: string;
  nameServers: string[];
}

/** POST /zones — adds the client's domain to AethrDesign's account as a full (nameserver) zone. */
export async function addZone(domain: string, dryRun: boolean): Promise<AddZoneResult> {
  const accountId = requireAccountId(dryRun);
  const result = await cf<{ id: string; name_servers: string[] }>("POST", "/zones", {
    dryRun,
    body: { name: domain, account: { id: accountId }, type: "full" },
    fake: { id: `dryrun-zone-${domain}`, name_servers: ["dryrun-ns1.cloudflare.com", "dryrun-ns2.cloudflare.com"] },
  });
  return { zoneId: result.id, nameServers: result.name_servers };
}

export interface TurnstileWidget {
  siteKey: string;
  secret: string;
}

/**
 * POST /accounts/{account}/challenges/widgets — one widget covering both hostnames a
 * client's site is ever reachable at (preview + apex), so DEPLOY doesn't need a second
 * widget or a second secret.
 */
export async function createTurnstileWidget(slug: string, domain: string, dryRun: boolean): Promise<TurnstileWidget> {
  const accountId = requireAccountId(dryRun);
  const domains = [previewHostname(slug), domain, `www.${domain}`];
  const result = await cf<{ sitekey: string; secret: string }>(
    "POST",
    `/accounts/${accountId}/challenges/widgets`,
    {
      dryRun,
      body: { name: workerName(slug), domains, mode: "managed" },
      fake: { sitekey: `dryrun-sitekey-${slug}`, secret: `dryrun-turnstile-secret-${slug}` },
    },
  );
  return { siteKey: result.sitekey, secret: result.secret };
}

/**
 * `wrangler secret put` has no REST equivalent worth calling directly — it already scopes
 * the write to one Worker and handles the stdin convention. Piped via `input`, never argv,
 * so the secret never appears in `ps` output or a shell history.
 */
export function setTurnstileSecret(slug: string, secret: string, dryRun: boolean): void {
  run("npx", ["wrangler", "secret", "put", "TURNSTILE_SECRET_KEY", "--name", workerName(slug)], dryRun, {
    input: secret,
  });
}

/**
 * One rate-limiting rule on the client's zone — the free plan allows exactly one
 * (deploy spec §3 / SPEC.md part 4 item 4). Defaults are a starting point, not a ruling:
 * 60 requests/60s per IP, 10-minute block. Tune per client if a real campaign needs more
 * headroom than a contact form ever legitimately gets.
 */
export async function createRateLimitRule(zoneId: string, slug: string, dryRun: boolean): Promise<void> {
  await cf<{ id: string }>("PUT", `/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`, {
    dryRun,
    body: {
      rules: [
        {
          description: `${slug} — one rate limit rule, free-plan ceiling`,
          expression: "true",
          action: "block",
          ratelimit: {
            characteristics: ["ip.src"],
            period: 60,
            requests_per_period: 60,
            mitigation_timeout: 600,
          },
        },
      ],
    },
    fake: { id: `dryrun-ruleset-${zoneId}` },
  });
}

export interface ZoneSetupResult {
  slug: string;
  domain: string;
  zoneId: string;
  nameServers: string[];
  workerName: string;
  turnstileSiteKey: string;
}

export async function zoneSetup(slug: string, domain: string, dryRun: boolean): Promise<ZoneSetupResult> {
  console.log(`ZONE SETUP ${slug} → ${domain}`);

  console.log("\n1. Add zone");
  const zone = await addZone(domain, dryRun);
  console.log(`   zone ${zone.zoneId} — nameservers: ${zone.nameServers.join(", ")}`);
  console.log(
    "   Give the client these nameservers (or use temporary registrar access to set them directly).",
  );

  console.log("\n2. Turnstile widget");
  const widget = await createTurnstileWidget(slug, domain, dryRun);
  console.log(`   site key ${widget.siteKey}`);

  console.log("\n3. Worker secret");
  setTurnstileSecret(slug, widget.secret, dryRun);

  console.log("\n4. Rate limit rule");
  await createRateLimitRule(zone.zoneId, slug, dryRun);

  console.log(
    "\n5. Record in state.md (batched, propose-class — paste this in by hand, same as the `analysis` line):\n" +
      `   worker-name: "${workerName(slug)}"\n` +
      `   cloudflare-zone: "${zone.zoneId}"\n` +
      "   ## Links\n" +
      `   - Staging URL: https://${previewHostname(slug)}\n` +
      `   - Production URL: https://${domain}\n`,
  );

  console.log(
    "\nReminder: NEXT_PUBLIC_TURNSTILE_SITE_KEY is a BUILD input. If this site was already " +
      "built and staged before this widget existed, rebuild with the site key above and re-stage " +
      "before DEPLOY — a Worker secret with no matching build-time key still rejects every submission.",
  );

  return {
    slug,
    domain,
    zoneId: zone.zoneId,
    nameServers: zone.nameServers,
    workerName: workerName(slug),
    turnstileSiteKey: widget.siteKey,
  };
}

// ---------------------------------------------------------------------------- CLI

function parseArgs(argv: string[]): { command: string; flags: Record<string, string | true> } {
  const [command, ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function required(flags: Record<string, string | true>, name: string): string {
  const value = flags[name];
  if (typeof value !== "string") throw new Error(`--${name} is required`);
  return value;
}

const USAGE = `Usage:
  npx tsx src/lib/deploy/zone-setup.ts run --slug <slug> --domain <apex> [--live]

Runs the full per-client zone setup: add zone, Turnstile widget, Worker secret, rate
limit rule, and prints the state.md block to paste in. Defaults to dry-run — this changes
a live Cloudflare account, so unlike deploy.ts, dry-run is the default here and --live is
opt-in, not the other way round. --live also needs AETHR_CLOUDFLARE_API_TOKEN and
AETHR_CLOUDFLARE_ACCOUNT_ID in the environment. Confirm each step with Chevis before passing
--live — nothing here decides that for you.
`;

if (process.argv[1]?.replace(/\\/g, "/").includes("deploy/zone-setup")) {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const dryRun = flags.live !== true;

  (async () => {
    try {
      switch (command) {
        case "run":
          await zoneSetup(required(flags, "slug"), required(flags, "domain"), dryRun);
          break;
        default:
          console.log(USAGE);
          process.exit(command ? 1 : 0);
      }
    } catch (err: unknown) {
      console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  })();
}
