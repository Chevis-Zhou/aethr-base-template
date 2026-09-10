import type { Tokens } from "./token-extraction";
import {
  contrastRatio,
  derivePalette,
  num,
  type Hsl,
} from "../theme/derive";

/**
 * WCAG contrast over the pairs the theme derives from the twelve tokens.
 *
 * **This never adjusts a token.** A failure is a flag on the REVIEW sheet, per 008 §4's
 * taxonomy: contrast is a semantic gap, and a pipeline that silently darkened a client's
 * brand colour to pass a ratio would be changing the one visual decision the client
 * actually made. The flag says which pair, by how much, and what the ratio is.
 *
 * The derivations are no longer restated here. `src/lib/theme/derive.ts` is the single
 * definition, `globals.css` consumes its variables and `layout.tsx` injects them, so the
 * drift this file's comment used to warn about is now impossible rather than watched for.
 */

export interface ContrastPair {
  name: string;
  bg: Hsl;
  fg: Hsl;
  /** AA threshold: 4.5 for body text, 3 for large text and UI components. */
  required: number;
}

export interface ContrastFlag {
  reason: "contrast-below-aa" | "token-too-pale";
  pair: string;
  detail: string;
}

export interface ContrastReport {
  results: { pair: string; ratio: number; required: number; passes: boolean }[];
  flags: ContrastFlag[];
}

export { contrastRatio };

/**
 * The six pairs the theme renders.
 *
 * `card` and `popover` share `card-foreground`'s derivation and differ from `background`
 * only in lightness (100% vs 98%), so `card/card-foreground` stands for both.
 */
export function derivePairs(tokens: Tokens): ContrastPair[] {
  const p = derivePalette(tokens);

  return [
    { name: "background / foreground", bg: p.background, fg: p.foreground, required: 4.5 },
    // A filled button: WCAG treats its label as text, so 4.5 rather than 3.
    { name: "primary / primary-foreground", bg: p.primary, fg: p.primaryForeground, required: 4.5 },
    {
      name: "secondary / secondary-foreground",
      bg: p.secondary,
      fg: p.secondaryForeground,
      required: 4.5,
    },
    { name: "accent / accent-foreground", bg: p.accent, fg: p.accentForeground, required: 4.5 },
    { name: "muted / muted-foreground", bg: p.muted, fg: p.mutedForeground, required: 4.5 },
    { name: "card / card-foreground", bg: p.card, fg: p.foreground, required: 4.5 },
  ];
}

/**
 * A colour this light is the pale-on-white case STATE.md names: the ratio may pass on the
 * derived foreground while the surface itself vanishes against `--background` at 98%.
 */
const PALE_THRESHOLD = 90;

export function checkContrast(tokens: Tokens): ContrastReport {
  const results = derivePairs(tokens).map((pair) => {
    const ratio = contrastRatio(pair.bg, pair.fg);
    return {
      pair: pair.name,
      ratio: Math.round(ratio * 100) / 100,
      required: pair.required,
      passes: ratio >= pair.required,
    };
  });

  const flags: ContrastFlag[] = results
    .filter((r) => !r.passes)
    .map((r) => ({
      reason: "contrast-below-aa" as const,
      pair: r.pair,
      detail:
        `${r.ratio}:1, below the ${r.required}:1 AA threshold. The foreground is already ` +
        `the better of the two polarities — this surface has no AA-passing text colour in ` +
        `either direction, so the fix is the colour, not the derivation.`,
    }));

  for (const [name, lightness] of [
    ["primary", num(tokens.primaryLightness)],
    ["accent", num(tokens.accentLightness)],
  ] as const) {
    if (lightness >= PALE_THRESHOLD) {
      flags.push({
        reason: "token-too-pale",
        pair: name,
        detail: `${name}Lightness is ${lightness}% — at or above ${PALE_THRESHOLD}%, the surface disappears against --background (98%)`,
      });
    }
  }

  return { results, flags };
}
