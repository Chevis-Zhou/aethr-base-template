import type { SectionType } from "../assembly/section-props";
import type { B2Value, B6Value, IntakeRecord } from "./intake";
import { selectRegister, type Register } from "./exemplars";

/**
 * Stage (b) of ANALYSIS — structure selection. Deterministic, no model.
 *
 * 008 §1: "Archetype → page and section skeleton, keyed on B2 / B3 / G1. Deterministic
 * lookup. Per the scope of record the client never picks section types."
 *
 * Everything this file emits is either a closed item a prior ticket ruled (page count from
 * G1, CTA targets from B3) or a *starting point* the model is free to depart from (the
 * skeletons). Ruling 10 puts "which sections appear and in what order" firmly on the open
 * side, so nothing here is a constraint on generation — see `ArchetypeSkeleton`.
 */

export type Archetype = "solo-professional" | "local-service" | "small-practice";

export type StructureFlagReason =
  | "archetype-inferred-from-other"
  | "cta-target-unruled"
  | "cta-fallback-no-booking-url"
  | "cta-fallback-no-phone"
  | "faq-unseeded"
  | "disclosure-has-no-intake-source";

export interface StructureFlag {
  reason: StructureFlagReason;
  message: string;
}

/**
 * An archetype's default section order.
 *
 * **This is a default, not a constraint.** Ruling 10 leaves which sections appear and in
 * what order entirely open to the model; the skeleton exists so a run with nothing to say
 * about ordering still produces a coherent page, and so the assertion suite has a baseline
 * to describe departures against. A generated spec that reorders, drops or adds sections
 * from this list has done nothing wrong. What it may *not* do is use a section type
 * outside the closed palette of fourteen, or one this intake makes impossible.
 */
export interface ArchetypeSkeleton {
  archetype: Archetype;
  /** Ordered, `footer` last. The model may depart from this in any way ruling 10 allows. */
  sections: SectionType[];
}

export interface PageSkeleton {
  slug: string;
  /** Suggested section order for this page, drawn from the archetype skeleton. */
  sections: SectionType[];
}

export interface CtaTarget {
  /** The href every CTA on the site resolves to. Closed — ruling 10. */
  href: string | null;
  /** Which B3 answer produced it, and by which branch. */
  derivedFrom: string;
}

export interface StructureResult {
  archetype: Archetype;
  /** The B2 answers that chose the archetype, for the flags sheet (008 §6). */
  archetypeChosenBy: B2Value[];
  /** The copy register, and the rule that picked it. Fully determined — never a REVIEW question. */
  register: { register: Register; reason: string };
  skeleton: ArchetypeSkeleton;
  pages: PageSkeleton[];
  cta: CtaTarget;
  /**
   * Section types this intake cannot support, because the field that feeds them is empty.
   * The prompt carries this so the model does not reach for them, and the assertion suite
   * asserts none of them appear in the emitted spec.
   */
  impossibleSections: SectionType[];
  flags: StructureFlag[];
}

// ---------------------------------------------------------------------------
// Archetype
// ---------------------------------------------------------------------------

/**
 * B2 audience → archetype. Total over `B2_VALUES` except `other`.
 *
 * The enumeration is an owner ruling of 2026-09-04 and is expected to grow with the
 * archetype set — *"it's an ongoing process."* Adding an audience means adding a row here;
 * adding an archetype means adding a column to `ARCHETYPE_SKELETONS` and re-pointing rows.
 * Because the vocabulary is closed at the schema, an unmapped value is now a compile error
 * rather than a runtime guess.
 */
const B2_ARCHETYPE: Record<Exclude<B2Value, "other">, Archetype> = {
  // A person's own practice or record — bought by, or evaluated for, an individual.
  parents: "solo-professional",
  students: "solo-professional",
  individuals: "solo-professional",
  "selection-committees": "solo-professional",
  // A household or premises buying a job of work.
  homeowners: "local-service",
  "property-managers": "local-service",
  "local-businesses": "local-service",
  // A firm serving clients, patients or capital.
  patients: "small-practice",
  businesses: "small-practice",
  institutions: "small-practice",
  investors: "small-practice",
  "referring-professionals": "small-practice",
};

const ARCHETYPE_ORDER: Archetype[] = ["solo-professional", "local-service", "small-practice"];

function inferArchetype(b2: B2Value[]): {
  archetype: Archetype;
  chosenBy: B2Value[];
  flags: StructureFlag[];
} {
  const flags: StructureFlag[] = [];

  if (b2.includes("other")) {
    flags.push({
      reason: "archetype-inferred-from-other",
      message:
        'B2 includes "other" — no audience category fit. The archetype comes from the ' +
        "remaining answers, or defaults to solo-professional. A recurring 'other' is the " +
        "signal to add an audience value or an archetype, never to invent one mid-run.",
    });
  }

  const votes = new Map<Archetype, B2Value[]>();

  for (const answer of b2) {
    if (answer === "other") continue;
    const archetype = B2_ARCHETYPE[answer];
    const existing = votes.get(archetype) ?? [];
    existing.push(answer);
    votes.set(archetype, existing);
  }

  // Majority, ties to solo-professional — which `ARCHETYPE_ORDER` puts first, so a stable
  // sort on vote count resolves ties without a special case.
  let winner: Archetype = "solo-professional";
  let best = 0;
  for (const archetype of ARCHETYPE_ORDER) {
    const count = votes.get(archetype)?.length ?? 0;
    if (count > best) {
      best = count;
      winner = archetype;
    }
  }

  return { archetype: winner, chosenBy: votes.get(winner) ?? [], flags };
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

/**
 * The three default section orders, as data.
 *
 * **No skeleton lists `footer`.** `layout.tsx` renders one from `clientConfig` on every
 * page already, so a `footer` section in a spec renders a *second* one inline —
 * `SPEC-FORMAT.md` says so explicitly ("typically not needed") and the skeletons used to
 * contradict it, which is why every replay through 2026-09-06 shipped two stacked footers.
 * The type stays in the closed palette: ruling 10's open hand lets the model add an inline
 * footer if a client genuinely needs one, and QA's landmark check names it if that happens.
 *
 * Sources: `SPEC-FORMAT.md` "Default page structures", the shipped Maxematics order
 * (hero → differentiators → about → topics → testimonials → rates → contact) for
 * solo-professional, and `productized-tier-scope.md`'s archetype fits for the other two —
 * `credentials` and `disclosure` lead in small-practice because 014 ordered them as the
 * finance/advisory enabler.
 */
export const ARCHETYPE_SKELETONS: Record<Archetype, ArchetypeSkeleton> = {
  "solo-professional": {
    archetype: "solo-professional",
    sections: [
      "hero",
      "feature-list",
      "about",
      "services",
      "stats",
      "testimonials",
      "pricing",
      "faq",
      "cta-band",
      "contact",
    ],
  },
  "local-service": {
    archetype: "local-service",
    sections: [
      "hero",
      "services",
      "feature-list",
      "stats",
      "testimonials",
      "pricing",
      "faq",
      "cta-band",
      "contact",
    ],
  },
  "small-practice": {
    archetype: "small-practice",
    sections: [
      "hero",
      "about",
      "services",
      "credentials",
      "stats",
      "feature-list",
      "testimonials",
      "faq",
      "cta-band",
      "contact",
      "disclosure",
    ],
  },
};

/**
 * Where the skeleton is cut when G1 asks for more than one page.
 *
 * Page *count* is closed (ruling 10, from G1). Which sections land on which page is not,
 * so this is a suggestion like the skeleton itself. `hero` and `cta-band` are pinned to
 * keep every route landable and every page closable. `footer` is deliberately not pinned:
 * `layout.tsx` renders one on every route already, so pinning it here put a second footer
 * on every secondary page as well as the home page.
 */
const SECONDARY_PAGES: Record<number, { slug: string; take: SectionType[] }[]> = {
  2: [{ slug: "/about", take: ["about", "credentials", "stats"] }],
  3: [
    { slug: "/about", take: ["about", "credentials", "stats"] },
    { slug: "/services", take: ["services", "pricing", "faq"] },
  ],
};

function buildPages(skeleton: ArchetypeSkeleton, pageCount: number): PageSkeleton[] {
  const secondary = SECONDARY_PAGES[pageCount] ?? [];
  const moved = new Set<SectionType>(secondary.flatMap((p) => p.take));

  const home: PageSkeleton = {
    slug: "/",
    sections: skeleton.sections.filter((s) => !moved.has(s)),
  };

  const rest = secondary.map((page) => ({
    slug: page.slug,
    sections: [
      "hero" as SectionType,
      ...skeleton.sections.filter((s) => page.take.includes(s)),
      "cta-band" as SectionType,
    ],
  }));

  return [home, ...rest];
}

// ---------------------------------------------------------------------------
// CTA target
// ---------------------------------------------------------------------------

/**
 * B3 → the site's single CTA target. Targets are closed (ruling 10); the *label* is prose
 * and stays with the model.
 *
 * `enquire`, `book`, `call` and `just-learn` are derivable from the field set. **`buy` and
 * `apply` were unruled** and were decided by the owner on 2026-09-04: both resolve to the
 * A8 booking/scheduling link when one is present, else fall back to enquire — and both are
 * **always** flagged, because neither answer has a target a ticket ruled and REVIEW should
 * see the substitution every time.
 */
export function resolveCtaHref(
  intake: IntakeRecord,
  pageCount: number,
): { cta: CtaTarget; flags: StructureFlag[] } {
  const flags: StructureFlag[] = [];
  const enquireHref = pageCount > 1 ? "/contact" : "#contact";

  const enquire = (derivedFrom: string): CtaTarget => ({ href: enquireHref, derivedFrom });

  switch (intake.B3) {
    case "enquire":
      return { cta: enquire("B3=enquire"), flags };

    case "book": {
      if (intake.A8) return { cta: { href: intake.A8, derivedFrom: "B3=book → A8" }, flags };
      flags.push({
        reason: "cta-fallback-no-booking-url",
        message: "B3=book but A8 (booking link) is empty. CTA falls back to enquire.",
      });
      return { cta: enquire("B3=book → A8 empty → enquire"), flags };
    }

    case "call": {
      if (intake.A5) {
        const tel = `tel:${intake.A5.replace(/[^\d+]/g, "")}`;
        return { cta: { href: tel, derivedFrom: "B3=call → A5" }, flags };
      }
      flags.push({
        reason: "cta-fallback-no-phone",
        message: "B3=call but A5 (phone) is empty. CTA falls back to enquire.",
      });
      return { cta: enquire("B3=call → A5 empty → enquire"), flags };
    }

    case "buy":
    case "apply": {
      flags.push({
        reason: "cta-target-unruled",
        message: `B3=${intake.B3} has no ticket-ruled CTA target. Owner decision 2026-09-04: A8 when present, else enquire. Confirm at REVIEW.`,
      });
      if (intake.A8) {
        return { cta: { href: intake.A8, derivedFrom: `B3=${intake.B3} → A8 (unruled)` }, flags };
      }
      return { cta: enquire(`B3=${intake.B3} → A8 empty → enquire (unruled)`), flags };
    }

    case "just-learn":
      // No CTA sections are emitted at all — the site is a credibility destination.
      return { cta: { href: null, derivedFrom: "B3=just-learn → no CTA" }, flags };
  }
}

// ---------------------------------------------------------------------------
// Impossible sections
// ---------------------------------------------------------------------------

function findImpossibleSections(intake: IntakeRecord): {
  impossible: SectionType[];
  flags: StructureFlag[];
} {
  const impossible: SectionType[] = [];
  const flags: StructureFlag[] = [];

  if (intake.D1.length === 0) impossible.push("stats");
  if (intake.D3.length === 0) impossible.push("testimonials");
  if (intake.C5.length === 0) impossible.push("portfolio");
  if (!intake.C3 || intake.C4.length === 0) impossible.push("pricing");
  if (intake.D2.length === 0) impossible.push("credentials");

  // `disclosure.body` is client-supplied regulatory text, verbatim, and the generator never
  // authors one (MAP). C7 is its only source — added 2026-09-04 precisely because the
  // section had none — and it is empty on most sites, which is the ordinary case rather
  // than a defect. No flag: a site with no regulatory text simply has no disclosure.
  if (!intake.C7.trim()) impossible.push("disclosure");

  // Not impossible — ruling 10 leaves FAQ authoring open, seeded by D5. An empty D5 means
  // the model writes questions unseeded, which REVIEW should know about.
  if (intake.D5.length === 0) {
    flags.push({
      reason: "faq-unseeded",
      message: "D5 is empty. Any FAQ is authored without client-supplied questions.",
    });
  }

  return { impossible, flags };
}

// ---------------------------------------------------------------------------
// Stage (b)
// ---------------------------------------------------------------------------

export function selectStructure(
  intake: IntakeRecord,
  /** B6 after out-of-vocabulary stripping — `parseIntake().voiceWords`. */
  voiceWords: B6Value[] = [],
): StructureResult {
  const { archetype, chosenBy, flags: archetypeFlags } = inferArchetype(intake.B2);
  const skeleton = ARCHETYPE_SKELETONS[archetype];

  const pageCount = Math.min(Math.max(intake.G1, 1), 3);
  const { cta, flags: ctaFlags } = resolveCtaHref(intake, pageCount);
  const { impossible, flags: sectionFlags } = findImpossibleSections(intake);

  const drop = new Set<SectionType>(impossible);
  if (cta.href === null) drop.add("cta-band");

  const trimmed: ArchetypeSkeleton = {
    archetype,
    sections: skeleton.sections.filter((s) => !drop.has(s)),
  };

  return {
    archetype,
    archetypeChosenBy: chosenBy,
    register: selectRegister(archetype, intake, voiceWords),
    skeleton: trimmed,
    pages: buildPages(trimmed, pageCount),
    cta,
    impossibleSections: impossible,
    flags: [...archetypeFlags, ...ctaFlags, ...sectionFlags],
  };
}
