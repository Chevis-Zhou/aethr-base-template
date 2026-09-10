/**
 * The one place the theme's derived colours are defined.
 *
 * Three consumers used to hold their own copy of these numbers: `globals.css` computed
 * them, `layout.tsx` injected the primitives they read, and `analysis/contrast.ts` restated
 * them to score WCAG pairs — with a comment admitting "there is no test that catches the
 * drift, so the comment is the guard." This module is the guard instead. `globals.css` now
 * consumes variables rather than constants, and both TypeScript consumers import from here.
 *
 * **Nothing in this file changes a client's colour.** The twelve tokens are the client's
 * three surfaces; what is derived is the *house-owned* text that sits on them, plus the
 * neutrals. Adjusting a client's brand hue to win a ratio is the one thing the pipeline
 * must never do — see `analysis/contrast.ts`, which flags and never fixes.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

// ---------------------------------------------------------------------------
// Colour math
// ---------------------------------------------------------------------------

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lN - c / 2;

  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** WCAG 2.x relative luminance. */
export function luminance(hsl: Hsl): number {
  const [r, g, b] = hslToRgb(hsl).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Hsl, b: Hsl): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// The derivation constants
// ---------------------------------------------------------------------------

/**
 * Neutral saturation. `background`, `foreground`, `muted`, `card` and `border` are the
 * client's primary *hue* at a fixed low saturation — tinted greys, not brand colours.
 */
export const NEUTRAL_S = 10;

export const BACKGROUND_L = 98;
export const CARD_L = 100;
export const FOREGROUND_L = 10;
export const MUTED_L = 94;

/**
 * `muted-foreground` was 45%, which is **3.26:1 to 4.4:1 against `muted` depending on hue —
 * below AA at every hue there is**. It is a house-owned grey with no client meaning, so the
 * fix is simply to darken it: 39% is the lightest value that clears 4.5:1 across the full
 * 360° sweep (worst case 4.64:1 at the yellow-greens, where perceived luminance peaks).
 */
export const MUTED_FOREGROUND_L = 39;

/** Text on a dark surface. */
export const ON_DARK_L = 98;
/** Text on a light surface. Saturation is capped so a vivid hue does not print as ink. */
export const ON_LIGHT_L = 12;
export const ON_LIGHT_MAX_S = 30;

/**
 * The polarity threshold, in relative luminance.
 *
 * The old derivations fixed a polarity per role — `primary-foreground` and
 * `secondary-foreground` were always light (`98%`), `accent-foreground` always dark (`15%`)
 * — which is only correct for one end of each surface's lightness range. Measured over a
 * 3,564-point (hue × saturation × lightness) grid: the always-light rule left **63%** of
 * the space below AA and the always-dark rule **54%**. Choosing polarity by the surface's
 * own luminance leaves **11%**.
 *
 * 0.18 is the sweep's minimum; 0.15 and 0.25 both score worse.
 *
 * That remaining 11% is not a bug to engineer away. Mid-luminance saturated colours have no
 * AA-passing foreground in either direction — it is a property of the WCAG formula, not of
 * this derivation — which is exactly why `contrast.ts` flags and never adjusts.
 */
export const LIGHT_ON_DARK_THRESHOLD = 0.18;

/** The foreground for a surface: light on dark, dark on light, whichever the surface asks for. */
export function onSurface(surface: Hsl): Hsl {
  return luminance(surface) < LIGHT_ON_DARK_THRESHOLD
    ? { h: surface.h, s: surface.s, l: ON_DARK_L }
    : { h: surface.h, s: Math.min(surface.s, ON_LIGHT_MAX_S), l: ON_LIGHT_L };
}

// ---------------------------------------------------------------------------
// The palette a spec's tokens produce
// ---------------------------------------------------------------------------

/** The nine numeric token fields, as `globals.css` receives them (`"271"`, `"81%"`). */
export interface TokenTriples {
  primaryHue: string;
  primarySaturation: string;
  primaryLightness: string;
  secondaryHue: string;
  secondarySaturation: string;
  secondaryLightness: string;
  accentHue: string;
  accentSaturation: string;
  accentLightness: string;
}

/** `"70%"` → 70, `"220"` → 220. Tokens are stored as CSS-ready strings. */
export function num(token: string): number {
  return Number.parseFloat(token.replace("%", ""));
}

export interface DerivedPalette {
  primary: Hsl;
  secondary: Hsl;
  accent: Hsl;
  primaryForeground: Hsl;
  secondaryForeground: Hsl;
  accentForeground: Hsl;
  background: Hsl;
  foreground: Hsl;
  card: Hsl;
  muted: Hsl;
  mutedForeground: Hsl;
}

export function derivePalette(t: TokenTriples): DerivedPalette {
  const primary: Hsl = {
    h: num(t.primaryHue),
    s: num(t.primarySaturation),
    l: num(t.primaryLightness),
  };
  const secondary: Hsl = {
    h: num(t.secondaryHue),
    s: num(t.secondarySaturation),
    l: num(t.secondaryLightness),
  };
  const accent: Hsl = {
    h: num(t.accentHue),
    s: num(t.accentSaturation),
    l: num(t.accentLightness),
  };
  const neutral = (l: number): Hsl => ({ h: primary.h, s: NEUTRAL_S, l });

  return {
    primary,
    secondary,
    accent,
    primaryForeground: onSurface(primary),
    secondaryForeground: onSurface(secondary),
    accentForeground: onSurface(accent),
    background: neutral(BACKGROUND_L),
    foreground: neutral(FOREGROUND_L),
    card: neutral(CARD_L),
    muted: neutral(MUTED_L),
    mutedForeground: neutral(MUTED_FOREGROUND_L),
  };
}

/**
 * The derived-foreground CSS variables `layout.tsx` injects beside the nine token
 * primitives. `globals.css` reads these rather than hardcoding a polarity, which is what
 * lets one stylesheet serve a dark navy primary and a pale mint one.
 *
 * Only saturation and lightness are emitted — the hue is always the surface's own, and
 * `globals.css` already has it.
 */
export function foregroundVars(t: TokenTriples): Record<string, string> {
  const p = derivePalette(t);
  return {
    "--primary-fg-s": `${p.primaryForeground.s}%`,
    "--primary-fg-l": `${p.primaryForeground.l}%`,
    "--secondary-fg-s": `${p.secondaryForeground.s}%`,
    "--secondary-fg-l": `${p.secondaryForeground.l}%`,
    "--accent-fg-s": `${p.accentForeground.s}%`,
    "--accent-fg-l": `${p.accentForeground.l}%`,
  };
}
