/**
 * The one-time zone chore from deploy spec part 5, cloud half: a single Response Header
 * Transform Rule on the `aethrdesign.com` zone that marks every client preview hostname
 * `noindex`, forever, with no per-client file (`SPEC.md`, "Runbook — one-time zone chores
 * (part 5)", item 1; spec of record `deploy-specification.md` §2).
 *
 * Idempotent by construction: it reads the zone's current response-header-transform
 * ruleset before writing, because Cloudflare's rulesets API takes the *whole* rule list on
 * write — a naive PUT of just this one rule would silently delete any other rule already
 * on that phase. This rule is identified by its description, so re-running after it's
 * already applied is a no-op rather than a duplicate.
 */

import { cf } from "./cloudflare-api";

const ZONE_NAME = "aethrdesign.com";
const PHASE = "http_response_headers_transform";
const RULE_DESCRIPTION = "noindex every client preview hostname — deploy spec part 5";

interface HeaderTransformRule {
  id?: string;
  description: string;
  expression: string;
  action: string;
  action_parameters: unknown;
}

async function findZoneId(domain: string, dryRun: boolean): Promise<string> {
  const result = await cf<Array<{ id: string; name: string }>>("GET", `/zones?name=${encodeURIComponent(domain)}`, {
    dryRun,
    fake: [{ id: `dryrun-zone-${domain}`, name: domain }],
  });
  const zone = result[0];
  if (!zone) throw new Error(`No Cloudflare zone found for "${domain}".`);
  return zone.id;
}

/**
 * Cloudflare returns an error, not an empty ruleset, when a zone has never had a rule on
 * this phase. Treated as "no existing rules" rather than a hard failure — that is the
 * expected state for a phase nothing has touched yet.
 */
async function getExistingRules(zoneId: string, dryRun: boolean): Promise<HeaderTransformRule[]> {
  try {
    const result = await cf<{ rules: HeaderTransformRule[] }>(
      "GET",
      `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`,
      { dryRun, fake: { rules: [] } },
    );
    return result.rules ?? [];
  } catch (err) {
    // 10003 "could not find entrypoint ruleset" is what a never-touched phase actually
    // returns — confirmed live on aethrdesign.com 2026-09-08. 10001/"not found" was the
    // guess this was written against and never fired.
    if (err instanceof Error && /not found|could not find entrypoint|1000[13]/i.test(err.message)) return [];
    throw err;
  }
}

export interface TransformRuleStatus {
  zoneId: string;
  alreadyApplied: boolean;
  ruleCount: number;
}

export async function checkTransformRule(dryRun: boolean): Promise<TransformRuleStatus> {
  const zoneId = await findZoneId(ZONE_NAME, dryRun);
  const existing = await getExistingRules(zoneId, dryRun);
  return {
    zoneId,
    alreadyApplied: existing.some((r) => r.description === RULE_DESCRIPTION),
    ruleCount: existing.length,
  };
}

export async function applyTransformRule(dryRun: boolean): Promise<void> {
  console.log(`TRANSFORM RULE — ${ZONE_NAME}, phase ${PHASE}`);

  const zoneId = await findZoneId(ZONE_NAME, dryRun);
  console.log(`  zone ${zoneId}`);

  const existing = await getExistingRules(zoneId, dryRun);
  console.log(`  ${existing.length} existing rule(s) on this phase`);

  if (existing.some((r) => r.description === RULE_DESCRIPTION)) {
    console.log("  already applied — nothing to do.");
    return;
  }

  const newRule: HeaderTransformRule = {
    description: RULE_DESCRIPTION,
    expression: `ends_with(http.host, "-preview.${ZONE_NAME}")`,
    action: "rewrite",
    action_parameters: {
      headers: {
        "X-Robots-Tag": { operation: "set", value: "noindex, nofollow" },
      },
    },
  };

  // Preserved list, not a replace — see the module comment on why this can't be a bare PUT.
  const rules = [...existing, newRule];

  await cf<{ id: string }>("PUT", `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`, {
    dryRun,
    body: { rules },
    fake: { id: `dryrun-ruleset-${zoneId}` },
  });

  console.log(
    "  applied. Every client preview hostname now serves X-Robots-Tag: noindex, nofollow — " +
      "one rule, covers every client forever.",
  );
}

// ---------------------------------------------------------------------------- CLI

const USAGE = `Usage:
  npx tsx src/lib/deploy/transform-rule.ts check          — report whether the rule exists
  npx tsx src/lib/deploy/transform-rule.ts apply [--live]  — create it if it doesn't

Defaults to dry-run, same reasoning as zone-setup.ts: this changes a live zone-wide
setting, so dry-run is the default and --live is opt-in. --live needs
AETHR_CLOUDFLARE_API_TOKEN in the environment. One-time chore — safe to re-run, it no-ops if
the rule is already there.
`;

if (process.argv[1]?.replace(/\\/g, "/").includes("deploy/transform-rule")) {
  const command = process.argv[2];
  const dryRun = process.argv.slice(3).includes("--live") ? false : true;

  (async () => {
    try {
      switch (command) {
        case "check": {
          const status = await checkTransformRule(dryRun);
          console.log(
            `zone ${status.zoneId} — ${status.ruleCount} rule(s), ` +
              `${status.alreadyApplied ? "already applied" : "not yet applied"}.`,
          );
          break;
        }
        case "apply":
          await applyTransformRule(dryRun);
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
