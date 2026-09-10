import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Archetype } from "../structure";
import type { B6Value, IntakeRecord } from "../intake";

/**
 * The exemplar corpus — `productized-voice.md` §6.
 *
 * Why this matters more than it looks: with no human polish (§8) and no human scoring
 * (§10), an industry-matched exemplar of real delivered copy is the **only** mechanism in
 * the system that produces good copy rather than merely preventing bad copy. The linter is
 * entirely prohibitive. This is the whole positive half.
 *
 * Four of the five registers were captured from the live client sites on 2026-09-04;
 * `practice-credibility` comes from delivered copy on disk. `local-service` is
 * unexemplified by owner ruling and stays that way until the first good delivery.
 */

export const REGISTERS = [
  "institutional-advisory",
  "warm-advisory",
  "practice-credibility",
  "direct-response",
  "local-service",
] as const;

export type Register = (typeof REGISTERS)[number];

/** Registers with no eligible exemplar. A run selecting one of these flags at REVIEW. */
const UNEXEMPLIFIED = new Set<Register>(["local-service"]);

export interface Exemplar {
  register: Register;
  /** The file's contents, handed to the model as generation context. */
  body: string;
}

/**
 * Load a register's exemplar, or `null` when the register is unexemplified.
 *
 * `null` is the signal the runner turns into the *"register unexemplified — generated on
 * the house register"* flag. It is not an error and must not be substituted for.
 */
export function loadExemplar(register: Register): Exemplar | null {
  if (UNEXEMPLIFIED.has(register)) return null;
  const path = join(__dirname, `${register}.md`);
  return { register, body: readFileSync(path, "utf8") };
}

export function isUnexemplified(register: Register): boolean {
  return UNEXEMPLIFIED.has(register);
}

/**
 * The register selection rule. **Total, deterministic, and settled** — owner ruling
 * 2026-09-04: *"I don't review prose or words, you need to define registers now."*
 *
 * Voice §6's matrix is written register-first and two of its rows land on each of two
 * archetypes, without saying how to choose. The rows themselves carry the discriminator, so
 * this rule reads it off the intake rather than off a taste call:
 *
 * | Archetype | Register | Chosen when |
 * |---|---|---|
 * | `local-service` | `local-service` | always — and it is unexemplified, so the run flags |
 * | `small-practice` | `warm-advisory` | §6: "where the buyer is an individual, not an institution" — B2 names an individual audience, or B6 skews warm |
 * | `small-practice` | `institutional-advisory` | otherwise |
 * | `solo-professional` | `direct-response` | §6: "selling a product or program" — B3 is `buy`/`apply`, or C1 is `work`, or B6 skews direct |
 * | `solo-professional` | `practice-credibility` | otherwise |
 *
 * B2 and B3/C1 lead because they are what §6's prose actually names; B6 is the tiebreak
 * where the structural fields are silent. Every branch returns a reason string, which goes
 * on the flags sheet as a record of the choice — not as a question for REVIEW.
 */

/** B2 audiences that are an individual buying for themselves, not an institution. */
const INDIVIDUAL_AUDIENCES: ReadonlySet<string> = new Set([
  "individuals",
  "patients",
  "parents",
  "students",
]);

export function selectRegister(
  archetype: Archetype,
  intake: Pick<IntakeRecord, "B2" | "B3" | "C1">,
  voiceWords: B6Value[],
): { register: Register; reason: string } {
  const has = (w: B6Value) => voiceWords.includes(w);

  if (archetype === "local-service") {
    return { register: "local-service", reason: "archetype=local-service" };
  }

  if (archetype === "small-practice") {
    const individualBuyer = intake.B2.some((a) => INDIVIDUAL_AUDIENCES.has(a));
    if (individualBuyer) {
      return {
        register: "warm-advisory",
        reason: `small-practice, B2 names an individual buyer (${intake.B2.filter((a) => INDIVIDUAL_AUDIENCES.has(a)).join(", ")})`,
      };
    }
    if (has("warm") || has("reassuring")) {
      return { register: "warm-advisory", reason: "small-practice, B6 skews warm" };
    }
    return { register: "institutional-advisory", reason: "small-practice, institutional audience" };
  }

  // solo-professional
  if (intake.B3 === "buy" || intake.B3 === "apply") {
    return {
      register: "direct-response",
      reason: `solo-professional, B3=${intake.B3} — selling a product or program`,
    };
  }
  if (intake.C1 === "work") {
    return { register: "direct-response", reason: "solo-professional, C1=work" };
  }
  if (has("direct") || has("no-nonsense") || has("playful")) {
    return { register: "direct-response", reason: "solo-professional, B6 skews direct" };
  }
  return { register: "practice-credibility", reason: "solo-professional, credibility site" };
}
