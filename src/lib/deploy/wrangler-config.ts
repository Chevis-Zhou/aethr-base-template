/**
 * Per-client `wrangler.jsonc` generator.
 *
 * Spec: `docs/wayfinder-product/assets/deploy-specification.md` §2 and §3.
 */

/** The staging zone. One suffix rule on this zone `noindex`es every client, forever. */
export const PREVIEW_ZONE = "aethrdesign.com";

/**
 * Slugs that would collide with a real hostname on the staging zone. Checked at
 * onboarding, never at deploy time — a slug collision found at DEPLOY is found at the
 * worst possible moment, with a client waiting.
 */
export const RESERVED_SLUGS = [
  "www",
  "portal",
  "mail",
  "api",
  "start",
  "internal",
  "preview",
  "staging",
  "cdn",
  "assets",
] as const;

export type DeployStage = "staging" | "production";

export interface DeployTarget {
  /** Client slug — the same one used for the Vault client folder and the Worker name. */
  slug: string;
  stage: DeployStage;
  /** The client's apex, e.g. `clientname.com`. Required at `production`. */
  domain?: string;
  /** Where this client's form submissions go. */
  contactEmail: string;
  /** Pinned per client at first deploy so a later redeploy cannot shift runtime behaviour. */
  compatibilityDate: string;
  /**
   * Hostnames already attached to this Worker that this write must keep.
   * Staging uses this so a re-stage cannot detach production routes; wrangler
   * reconciles Custom Domains to exactly the list in the config.
   */
  extraHostnames?: string[];
}

export interface SlugProblem {
  slug: string;
  reason: string;
}

/**
 * Slug rules are a hostname's rules, not a filename's: lowercase, alphanumeric and
 * hyphens, no leading or trailing hyphen. The 45-char ceiling leaves room for the
 * `-preview.aethrdesign.com` suffix inside DNS's 63-character label limit.
 */
export function validateSlug(slug: string): SlugProblem | null {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return {
      slug,
      reason:
        "must be lowercase alphanumeric with internal hyphens only (no leading, trailing or repeated separators)",
    };
  }
  if (slug.length > 45) {
    return { slug, reason: `is ${slug.length} chars; the -preview hostname label caps it at 45` };
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return { slug, reason: `is reserved — it would collide with ${slug}.${PREVIEW_ZONE}` };
  }
  return null;
}

export function previewHostname(slug: string): string {
  // Flat, not `<slug>.preview.aethrdesign.com`: Cloudflare's free Universal SSL covers the
  // apex and exactly one wildcard level. A three-level host would depend on the Worker
  // provisioning its own per-hostname certificate — probably fine, unverified, and bought
  // only with a prettier URL.
  return `${slug}-preview.${PREVIEW_ZONE}`;
}

export function workerName(slug: string): string {
  return `site-${slug}`;
}

/**
 * Custom Domains attached at each stage.
 *
 * The preview hostname stays attached through production and is retired ~30 days after
 * DEPLOY — separately, so that retiring it is a deliberate act rather than a side effect
 * of going live. DEPLOY only ever *adds* routes. Staging writes back any already-attached
 * non-preview hostname (ticket 027), because wrangler reconciles Custom Domains to exactly
 * this list.
 */
export function routesFor(target: DeployTarget): string[] {
  const routes = [previewHostname(target.slug)];
  if (target.stage === "production") {
    if (!target.domain) {
      throw new Error(`production deploy for "${target.slug}" needs a domain`);
    }
    routes.push(target.domain, `www.${target.domain}`);
  }
  for (const hostname of target.extraHostnames ?? []) {
    if (hostname && !routes.includes(hostname)) routes.push(hostname);
  }
  return routes;
}

/**
 * Production (and any other) hostnames already on the Worker. Staging must write
 * these back into the config — wrangler will otherwise detach them. The preview
 * host is excluded because `routesFor` always includes it.
 */
export function hostnamesToPreserve(slug: string, attached: string[]): string[] {
  const preview = previewHostname(slug);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hostname of attached) {
    if (!hostname || hostname === preview || seen.has(hostname)) continue;
    seen.add(hostname);
    out.push(hostname);
  }
  return out;
}

export function missingHostnames(expected: string[], attached: string[]): string[] {
  const have = new Set(attached);
  return expected.filter((hostname) => !have.has(hostname));
}

export function generateWranglerConfig(target: DeployTarget): string {
  const problem = validateSlug(target.slug);
  if (problem) {
    throw new Error(`Invalid slug "${problem.slug}": it ${problem.reason}.`);
  }

  const config = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerName(target.slug),
    main: "src/worker.ts",
    compatibility_date: target.compatibilityDate,
    assets: {
      directory: "./out",
      binding: "ASSETS",
      not_found_handling: "404-page",
      // The whole cost model in one line: only a real form submission invokes the Worker.
      // Every page, image and script is a free static-asset hit that never enters the
      // account-wide 100,000-requests/day budget.
      run_worker_first: ["/api/contact"],
    },
    vars: {
      CONTACT_EMAIL: target.contactEmail,
    },
    routes: routesFor(target).map((pattern) => ({ pattern, custom_domain: true })),
  };

  const header = [
    "// GENERATED — do not edit.",
    "// Written by src/lib/deploy/wrangler-config.ts at STAGING and again at DEPLOY.",
    `// Client: ${target.slug}   Stage: ${target.stage}`,
    "//",
    "// RESEND_API_KEY and TURNSTILE_SECRET_KEY are wrangler secrets, never vars —",
    "// they must not appear in this file.",
    "",
  ].join("\n");

  return header + JSON.stringify(config, null, 2) + "\n";
}
