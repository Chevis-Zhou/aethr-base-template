import { chromium, type Page } from "playwright";
import { tokensSchema } from "../assembly/site-spec";
import type { z } from "zod/v4";

/**
 * ANALYSIS stage (a) — token extraction. Deterministic script, never an LLM: a
 * hallucinated hex is a failure a script cannot have. See docs/wayfinder-product
 * tickets 008 and 009, and MAP.md "Build token extraction".
 *
 * Hard rule this file exists to satisfy: on failure, never let a model guess
 * colours off a screenshot. Fall back to the client's own closed-vocabulary
 * questionnaire answers (E3 accent, E5 type feel) and raise a REVIEW flag naming
 * the unreadable URL — never silently ship a default under a sales line that
 * promised the reference was matched.
 */

export type Tokens = z.infer<typeof tokensSchema>;

/** E3 — brand colour: colour picker / "use my logo" / "you choose". */
export type AccentAnswer = { mode: "hex"; hex: string } | { mode: "use-logo" } | { mode: "you-choose" };

/** E5 — type feel, closed vocabulary. */
export type TypeFeel = "modern-sans" | "editorial-serif" | "you-choose";

export interface TokenExtractionInput {
  /** E1 — the client's reference URL. Sole input to all twelve `tokens` fields. */
  referenceUrl: string;
  accent: AccentAnswer;
  typeFeel: TypeFeel;
}

export type ExtractionFailureReason =
  | "navigation-timeout"
  | "navigation-error"
  | "bot-challenge"
  | "http-error"
  | "no-brand-color-found";

export interface ExtractionFlag {
  reason: ExtractionFailureReason;
  url: string;
  message: string;
}

export interface TokenExtractionResult {
  status: "extracted" | "fallback";
  tokens: Tokens;
  flag: ExtractionFlag | null;
}

// ---------------------------------------------------------------------------
// Colour math
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Parses a `getComputedStyle` colour string — always `rgb()`/`rgba()` in Chromium. */
function parseCssColor(value: string | null): Rgb | null {
  if (!value) return null;
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

/** Transparent, near-white, near-black or low-chroma (grey chrome) — not a brand colour. */
function isNeutral(rgb: Rgb): boolean {
  if (rgb.a < 0.5) return true;
  const { r, g, b } = rgb;
  const nearWhite = r > 245 && g > 245 && b > 245;
  const nearBlack = r < 12 && g < 12 && b < 12;
  const lowChroma = Math.max(r, g, b) - Math.min(r, g, b) < 12;
  return nearWhite || nearBlack || lowChroma;
}

function sameColor(a: Rgb, b: Rgb): boolean {
  return Math.abs(a.r - b.r) < 8 && Math.abs(a.g - b.g) < 8 && Math.abs(a.b - b.b) < 8;
}

function hslToken(h: number, s: number, l: number): { hue: string; saturation: string; lightness: string } {
  return {
    hue: String(Math.round(((h % 360) + 360) % 360)),
    saturation: `${clamp(Math.round(s), 0, 100)}%`,
    lightness: `${clamp(Math.round(l), 0, 100)}%`,
  };
}

// ---------------------------------------------------------------------------
// Font matching — the extracted family must resolve to a name Google Fonts
// serves, since `layout.tsx` fetches `tokens.fontHeading`/`fontBody` directly
// from the Google Fonts API. Mapping an arbitrary system font to the nearest
// entry in SPEC-FORMAT.md's supported list is a closed, deterministic lookup —
// not a guess about what the reference "means".
// ---------------------------------------------------------------------------

const GOOGLE_FONT_NAMES = [
  "Inter", "DM Sans", "Sora", "Nunito", "Playfair Display", "Lora",
  "Merriweather", "Poppins", "Raleway", "Open Sans", "Roboto",
];

const SANS_PAIR = { fontHeading: "Sora", fontBody: "Inter" };
const SERIF_PAIR = { fontHeading: "Playfair Display", fontBody: "Lora" };
const NEUTRAL_PAIR = { fontHeading: "Inter", fontBody: "Inter" };

function matchDirectGoogleFont(fontFamilyCss: string): string | null {
  const families = fontFamilyCss.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
  for (const f of families) {
    const hit = GOOGLE_FONT_NAMES.find((g) => g.toLowerCase() === f.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function classifyGeneric(fontFamilyCss: string): "serif" | "sans" | "unknown" {
  const lower = fontFamilyCss.toLowerCase();
  if (/\bserif\b/.test(lower) && !/sans-serif/.test(lower)) return "serif";
  if (/sans-serif/.test(lower)) return "sans";
  if (/georgia|times|garamond|palatino|cambria|book antiqua/.test(lower)) return "serif";
  if (/helvetica|arial|segoe|system-ui|-apple-system|verdana|tahoma|calibri/.test(lower)) return "sans";
  return "unknown";
}

/** E5 forces a pair when it names one; "you-choose" honours what the reference itself uses. */
function resolveFontPair(headingFamilyCss: string, bodyFamilyCss: string, typeFeel: TypeFeel) {
  if (typeFeel === "modern-sans") return SANS_PAIR;
  if (typeFeel === "editorial-serif") return SERIF_PAIR;

  const directHeading = matchDirectGoogleFont(headingFamilyCss);
  const directBody = matchDirectGoogleFont(bodyFamilyCss);
  if (directHeading && directBody) return { fontHeading: directHeading, fontBody: directBody };

  const generic = classifyGeneric(headingFamilyCss);
  if (generic === "serif") return SERIF_PAIR;
  if (generic === "sans") return SANS_PAIR;
  return NEUTRAL_PAIR;
}

// ---------------------------------------------------------------------------
// Bot / challenge detection
// ---------------------------------------------------------------------------

const CHALLENGE_TITLE_RE = /just a moment|checking your browser|attention required|please wait|verify you are human|access denied/i;
const CHALLENGE_SELECTORS = [
  "#challenge-running",
  ".cf-browser-verification",
  "#cf-wrapper",
  '[data-translate="checking_browser"]',
];

async function detectChallenge(page: Page, status: number | null): Promise<boolean> {
  if (status !== null && [403, 429, 503].includes(status)) return true;
  const title = await page.title().catch(() => "");
  if (CHALLENGE_TITLE_RE.test(title)) return true;
  for (const sel of CHALLENGE_SELECTORS) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// DOM sampling
// ---------------------------------------------------------------------------

const HEADER_SELECTORS = ["header", "nav", '[class*="navbar" i]', '[class*="header" i]'];
const CTA_SELECTORS = [
  'a[class*="btn" i]',
  'button[class*="btn" i]',
  '[class*="cta" i]',
  'a[class*="button" i]',
  "button",
];
const SECONDARY_SELECTORS = ["footer", "section:nth-of-type(2)", '[class*="band" i]'];
const RADIUS_SELECTORS = ["button", 'a[class*="btn" i]', '[class*="card" i]'];

async function sampleBackground(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count().catch(() => 0)) === 0) continue;
    const bg = await el.evaluate((node) => getComputedStyle(node as Element).backgroundColor).catch(() => null);
    if (bg) return bg;
  }
  return null;
}

async function sampleFontFamily(page: Page, selector: string): Promise<string | null> {
  const el = page.locator(selector).first();
  if ((await el.count().catch(() => 0)) === 0) return null;
  return el.evaluate((node) => getComputedStyle(node as Element).fontFamily).catch(() => null);
}

async function sampleRadiusPx(page: Page): Promise<number | null> {
  for (const sel of RADIUS_SELECTORS) {
    const el = page.locator(sel).first();
    if ((await el.count().catch(() => 0)) === 0) continue;
    const val = await el.evaluate((node) => getComputedStyle(node as Element).borderRadius).catch(() => null);
    if (!val) continue;
    const px = parseFloat(val);
    if (!Number.isNaN(px)) return px;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Token assembly
// ---------------------------------------------------------------------------

function buildTokens(parts: {
  primaryHsl: Hsl;
  secondaryHsl: Hsl;
  accentHsl: Hsl;
  fontPair: { fontHeading: string; fontBody: string };
  radiusRem: number;
}): Tokens {
  const primary = hslToken(parts.primaryHsl.h, parts.primaryHsl.s, parts.primaryHsl.l);
  const secondary = hslToken(parts.secondaryHsl.h, parts.secondaryHsl.s, parts.secondaryHsl.l);
  const accent = hslToken(parts.accentHsl.h, parts.accentHsl.s, parts.accentHsl.l);
  const radius = `${parts.radiusRem.toFixed(2).replace(/\.?0+$/, "") || "0"}rem`;

  // Validated against the real SiteSpec `tokens` schema, not by inspection —
  // a shape mistake here fails loudly instead of reaching REVIEW.
  return tokensSchema.parse({
    primaryHue: primary.hue,
    primarySaturation: primary.saturation,
    primaryLightness: primary.lightness,
    secondaryHue: secondary.hue,
    secondarySaturation: secondary.saturation,
    secondaryLightness: secondary.lightness,
    accentHue: accent.hue,
    accentSaturation: accent.saturation,
    accentLightness: accent.lightness,
    fontHeading: parts.fontPair.fontHeading,
    fontBody: parts.fontPair.fontBody,
    radius,
  });
}

/**
 * The house fallback palette — what a client's site themes on when their reference URL
 * could not be read. Replaced 2026-09-04; the previous set (`220 15% 45%`, a derived
 * secondary, `38 75% 55%`) put **three of six derived pairs below AA on the palette that
 * ships whenever extraction fails**, which is the one palette that had to be safe.
 *
 * The replacement is taken from **Untitled UI**'s published scale rather than picked by
 * eye — a widely-used, professionally-tuned system whose neutral ramp is built for exactly
 * this job. All three are verified against `src/lib/theme/derive.ts`: six of six pairs pass
 * AA, the tightest at 5.17:1.
 *
 * Deliberately non-branded — a fallback must never look like it matched something. Two
 * steps of one grey ramp plus a single warm accent reads as a considered neutral system,
 * which is the honest signal: we chose this, we did not read it off your site.
 */
/** Untitled UI Gray 700 `#344054`. */
const HOUSE_NEUTRAL_PRIMARY: Hsl = { h: 218, s: 24, l: 27 };
/** Untitled UI Gray 600 `#475467` — one step up the same ramp. */
const HOUSE_NEUTRAL_SECONDARY: Hsl = { h: 216, s: 18, l: 34 };
/** Untitled UI Warning 700 `#B54708`. Warm, per SPEC-FORMAT's "Professional/conservative" accent guidance. */
const HOUSE_ACCENT_DEFAULT: Hsl = { h: 22, s: 92, l: 37 };

function deriveSecondaryFromPrimary(primary: Hsl): Hsl {
  return {
    h: (primary.h + 30) % 360,
    s: clamp(primary.s - 20, 10, 100),
    l: clamp(primary.l + 10, 15, 90),
  };
}

/**
 * The palette a client themes on when their reference URL could not be read — exported so
 * an offline run reaches it by the same path a failed extraction does. A second copy of
 * these constants anywhere else is the bug this export exists to prevent.
 */
export function buildFallbackTokens(input: TokenExtractionInput): Tokens {
  const primaryHsl = HOUSE_NEUTRAL_PRIMARY;
  const secondaryHsl = HOUSE_NEUTRAL_SECONDARY;
  const accentHsl = input.accent.mode === "hex" && input.accent.hex
    ? rgbToHsl(...(Object.values(hexToRgb(input.accent.hex)) as [number, number, number]))
    : HOUSE_ACCENT_DEFAULT;
  const fontPair = resolveFontPair("", "", input.typeFeel);
  return buildTokens({ primaryHsl, secondaryHsl, accentHsl, fontPair, radiusRem: 0.5 });
}

function fallbackResult(
  input: TokenExtractionInput,
  reason: ExtractionFailureReason,
  detail: string,
): TokenExtractionResult {
  return {
    status: "fallback",
    tokens: buildFallbackTokens(input),
    flag: {
      reason,
      url: input.referenceUrl,
      message: `Token extraction failed (${reason}) on ${input.referenceUrl}: ${detail}. Tokens fell back to client-stated E3/E5 answers plus house defaults — REVIEW must confirm before this client's site ships.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function extractTokens(input: TokenExtractionInput): Promise<TokenExtractionResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    let status: number | null;
    try {
      // `networkidle` alone is too strict for real sites — analytics beacons and
      // chat widgets keep the network busy forever, turning a fine static site
      // into a false "navigation-timeout". Load, then wait for idle best-effort.
      const response = await page.goto(input.referenceUrl, { waitUntil: "load", timeout: 15000 });
      status = response?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason: ExtractionFailureReason = /timeout/i.test(message) ? "navigation-timeout" : "navigation-error";
      return fallbackResult(input, reason, message);
    }

    if (await detectChallenge(page, status)) {
      return fallbackResult(input, "bot-challenge", `bot/challenge page detected (HTTP ${status ?? "unknown"})`);
    }
    if (status !== null && status >= 400) {
      return fallbackResult(input, "http-error", `reference URL returned HTTP ${status}`);
    }

    const headerBg = await sampleBackground(page, HEADER_SELECTORS);
    const ctaBg = await sampleBackground(page, CTA_SELECTORS);
    const secondaryBg = await sampleBackground(page, SECONDARY_SELECTORS);
    const headingFont = (await sampleFontFamily(page, "h1")) ?? "";
    const bodyFont = (await sampleFontFamily(page, "body")) ?? "";
    const radiusPx = await sampleRadiusPx(page);

    const headerC = parseCssColor(headerBg);
    const ctaC = parseCssColor(ctaBg);
    const secondaryC = parseCssColor(secondaryBg);

    const nonNeutral = [headerC, ctaC, secondaryC].filter((c): c is Rgb => c !== null && !isNeutral(c));
    if (nonNeutral.length === 0) {
      return fallbackResult(
        input,
        "no-brand-color-found",
        "no non-neutral background colour found on header, CTA, or secondary sections",
      );
    }

    const primaryC = headerC && !isNeutral(headerC) ? headerC : nonNeutral[0];
    const primaryHsl = rgbToHsl(primaryC.r, primaryC.g, primaryC.b);

    const accentC = ctaC && !isNeutral(ctaC) && !sameColor(ctaC, primaryC) ? ctaC : primaryC;
    const accentHsl = rgbToHsl(accentC.r, accentC.g, accentC.b);

    const secondaryHsl = secondaryC && !isNeutral(secondaryC) && !sameColor(secondaryC, primaryC)
      ? rgbToHsl(secondaryC.r, secondaryC.g, secondaryC.b)
      : deriveSecondaryFromPrimary(primaryHsl);

    const radiusRem = radiusPx !== null ? clamp(radiusPx / 16, 0, 1.5) : 0.5;
    const fontPair = resolveFontPair(headingFont, bodyFont, input.typeFeel);

    return {
      status: "extracted",
      tokens: buildTokens({ primaryHsl, secondaryHsl, accentHsl, fontPair, radiusRem }),
      flag: null,
    };
  } finally {
    await browser.close();
  }
}

// CLI entry point:
// npx tsx src/lib/analysis/token-extraction.ts <url> [--accent=#hex] [--type-feel=modern-sans|editorial-serif|you-choose]
if (process.argv[1]?.replace(/\\/g, "/").includes("analysis/token-extraction")) {
  const url = process.argv[2];
  if (!url) {
    console.error(
      "Usage: npx tsx src/lib/analysis/token-extraction.ts <url> [--accent=#hex] [--type-feel=modern-sans|editorial-serif|you-choose]",
    );
    process.exit(1);
  }
  const args = process.argv.slice(3);
  const accentArg = args.find((a) => a.startsWith("--accent="))?.split("=")[1];
  const typeFeelArg = args.find((a) => a.startsWith("--type-feel="))?.split("=")[1] as TypeFeel | undefined;

  // --accent takes a #hex value, or the literal strings "use-logo" / "you-choose" — E3's
  // other two closed-vocabulary answers, which carry no colour to fall back to.
  let accent: AccentAnswer;
  if (!accentArg || accentArg === "you-choose") accent = { mode: "you-choose" };
  else if (accentArg === "use-logo") accent = { mode: "use-logo" };
  else accent = { mode: "hex", hex: accentArg };

  const input: TokenExtractionInput = {
    referenceUrl: url,
    accent,
    typeFeel: typeFeelArg ?? "you-choose",
  };

  extractTokens(input)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "fallback" && result.flag) {
        console.error(`\nFALLBACK — ${result.flag.reason}: ${result.flag.message}`);
      }
    })
    .catch((err: unknown) => {
      console.error("Token extraction crashed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
