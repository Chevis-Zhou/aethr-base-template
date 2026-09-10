import { z } from "zod/v4";

/**
 * The INTAKE record — `questionnaire-field-set.md` §2, plus C7 (owner ruling 2026-09-04),
 * so forty fields rather than the thirty-nine every prior document quotes.
 *
 * Shape only, per the map's ruling 10: closed vocabularies are enumerated because a prior
 * ticket ruled each set, and nothing here constrains what a client may *say* in an open
 * field. No min-lengths, no content enums beyond the ruled vocabularies.
 *
 * B6 is the one closed field that does not reject on a bad value — see `parseIntake`.
 * Every other closed field is a parse error, because a form control enforces it upstream
 * (§9: "the eight closed-vocabulary selects are enforced by the control rather than by a
 * prompt") and a value that got past the control is a broken record, not a soft signal.
 *
 * G3 is `z.string()` and is never parsed further. 004 records it as the field where
 * Maxematics' most important sentence would have landed, and it reaches REVIEW verbatim.
 */

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** B3 — what a visitor should do next. Field set §2, Group B. Drives every CTA target. */
export const B3_VALUES = [
  "enquire",
  "book",
  "call",
  "buy",
  "apply",
  "just-learn",
] as const;

/**
 * B6 — the voice vocabulary. Nine words, `productized-voice.md` §5 / field set §11.
 * Pick up to three. Voice-only since 007: token mood comes from E1 extraction.
 */
export const B6_VALUES = [
  "warm",
  "plain-spoken",
  "precise",
  "authoritative",
  "calm",
  "direct",
  "reassuring",
  "no-nonsense",
  "playful",
] as const;

/** C1 — services, topics, or work. Decides which of C2/C5 renders. */
export const C1_VALUES = ["services", "topics", "work"] as const;

/** E4 — section background scheme. */
export const E4_VALUES = ["light", "dark", "alternating"] as const;

/** E5 — type feel. Mirrors `TypeFeel` in `token-extraction.ts`; keep the two in step. */
export const E5_VALUES = ["modern-sans", "editorial-serif", "you-choose"] as const;

/** E6 — logo status. `needs-work` and `none` are the L3 routing signals. */
export const E6_VALUES = ["have-final", "needs-work", "none"] as const;

/** F4 — when missing assets arrive. Starts the 7-day timer. */
export const F4_VALUES = ["attached-now", "within-7-days", "use-your-defaults"] as const;

export type B3Value = (typeof B3_VALUES)[number];
export type B6Value = (typeof B6_VALUES)[number];
export type C1Value = (typeof C1_VALUES)[number];

/**
 * B2 — "Who is this site for?" Multiselect, plus `other`.
 *
 * **Enumerated by owner ruling 2026-09-04.** Field set §2 marked B2 `closed` and no ticket
 * ever listed the values, so the Maxematics back-fit answered it with ad-hoc slugs. The
 * owner's ruling closes it: pick a set now, accept that it is imperfect, and grow it as
 * archetypes are added — *"it doesn't have to be perfect, we will have more archetypes in
 * the future anyway, it's an ongoing process."*
 *
 * Twelve values plus `other`, grouped so archetype inference is a lookup rather than a
 * judgement (`B2_ARCHETYPE` in `structure.ts`). Kept to twelve because B2 sits on the
 * checkout surface, where §12 records that every added field competes with the gallery.
 */
export const B2_VALUES = [
  // → solo-professional: a person's own practice or record.
  "parents",
  "students",
  "individuals",
  "selection-committees",
  // → local-service: a household or premises buying a job of work.
  "homeowners",
  "property-managers",
  "local-businesses",
  // → small-practice: a firm serving clients, patients or capital.
  "patients",
  "businesses",
  "institutions",
  "investors",
  "referring-professionals",
  // No category fits. Never blocks — §12 rules that an unfitting audience is an expansion
  // cost AethrDesign absorbs, not a discouragement at checkout.
  "other",
] as const;

export type B2Value = (typeof B2_VALUES)[number];

const b2Schema = z.array(z.enum(B2_VALUES)).min(1);

/** E3 — brand colour. A hex, "use my logo", or "you choose". */
const e3Schema = z.union([
  z.string().regex(/^#[0-9a-fA-F]{6}$/, "E3 must be a 6-digit hex colour, 'use-logo', or 'you-choose'"),
  z.literal("use-logo"),
  z.literal("you-choose"),
]);

const labelPriceSchema = z.object({ label: z.string(), price: z.string() });
const valueLabelSchema = z.object({ value: z.string(), label: z.string() });

const testimonialSchema = z.object({
  quote: z.string(),
  name: z.string(),
  role: z.string().optional(),
});

const portfolioItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
});

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export const intakeSchema = z
  .object({
    // Group A — identity and contact
    A1: z.string().min(1),
    A2: z.string().optional().default(""),
    A3: z.string().optional().default(""),
    A4: z.string().email(),
    A5: z.string().optional().default(""),
    A6: z.string().optional().default(""),
    A7: z
      .object({
        facebook: z.string().optional(),
        instagram: z.string().optional(),
        linkedin: z.string().optional(),
        twitter: z.string().optional(),
      })
      .optional()
      .default({}),
    A8: z.string().optional().default(""),
    A9: z.string().optional().default(""),

    // Group B — positioning
    B1: z.string().min(1),
    B2: b2Schema,
    B3: z.enum(B3_VALUES),
    B4: z.array(z.string()).default([]),
    B5: z.string().optional().default(""),
    // Validated by `parseIntake`, not here — out-of-vocabulary words are stripped and
    // reported rather than rejected. See the note at the top of this file.
    B6: z.array(z.string()).default([]),

    // Group C — what you offer
    C1: z.enum(C1_VALUES),
    C2: z.array(z.string()).default([]),
    C3: z.boolean(),
    C4: z.array(labelPriceSchema).default([]),
    C5: z.array(portfolioItemSchema).default([]),
    C6: z.string().optional().default(""),
    /**
     * C7 — legal or regulatory text the site must display. Optional, and empty on most
     * sites. Added by owner ruling 2026-09-04, closing the gap that `disclosure` was the
     * one section type with no intake source at all: its `body` must be client-supplied
     * verbatim, and nothing on the form supplied it. Owner: *"lots of websites don't need
     * disclosure at all... it's optional in intake, just add a question on the intake."*
     * Never generated, never summarised — adequacy and jurisdiction are the client's
     * counsel's problem, per MAP.
     */
    C7: z.string().optional().default(""),

    // Group D — proof
    D1: z.array(valueLabelSchema).default([]),
    D2: z.array(z.string()).default([]),
    D3: z.array(testimonialSchema).default([]),
    D4: z.array(z.string()).default([]),
    D5: z.array(z.string()).default([]),

    // Group E — visual direction
    E1: z.string().min(1),
    E2: z.array(z.string()).default([]),
    E3: e3Schema,
    E4: z.enum(E4_VALUES),
    E5: z.enum(E5_VALUES),
    E6: z.enum(E6_VALUES),

    // Group F — assets
    F1: z.string().optional().default(""),
    F2: z.array(z.string()).default([]),
    F3: z.string().optional().default(""),
    F4: z.enum(F4_VALUES),

    // Group G — scope and price
    G1: z.number().int().min(1),
    G2: z.array(z.string()).default([]),
    /** REVIEW context only. Never parsed, never fed to a rule. */
    G3: z.string().optional().default(""),
  })
  .strict();

export type IntakeRecord = z.infer<typeof intakeSchema>;

/** A B6 word the client selected that is not in the closed set. The runner flags these. */
export interface IntakeFlag {
  reason: "b6-out-of-vocabulary";
  detail: string[];
}

export interface IntakeParseResult {
  intake: IntakeRecord;
  /** B6 with out-of-vocabulary words removed. Use this, not `intake.B6`. */
  voiceWords: B6Value[];
  flags: IntakeFlag[];
}

/**
 * Parse an INTAKE record. Throws a path-addressed error on any closed-vocabulary
 * violation except B6, whose stray words are stripped and returned as a flag.
 *
 * B6 is treated differently because its closed set was rewritten by 007 *after* the
 * questionnaire shipped — a record written under the old set ("clean", "modern") is stale,
 * not malformed, and the right response is to generate on the house register and tell
 * REVIEW, rather than to park the client.
 */
export function parseIntake(input: unknown): IntakeParseResult {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  const known = new Set<string>(B6_VALUES);
  const voiceWords = parsed.data.B6.filter((w): w is B6Value => known.has(w));
  const stray = parsed.data.B6.filter((w) => !known.has(w));

  const flags: IntakeFlag[] = stray.length
    ? [{ reason: "b6-out-of-vocabulary", detail: stray }]
    : [];

  return { intake: parsed.data, voiceWords, flags };
}
