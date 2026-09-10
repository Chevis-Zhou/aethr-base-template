# Site Spec Format Reference

This document defines the JSON schema that the ANALYSIS stage must produce for the BUILD stage assembler. A valid spec, when passed to `assembleFromSpec()`, generates a complete multi-page Next.js site from the section component library.

## Top-Level Structure

```json
{
  "client": { ... },
  "tokens": { ... },
  "pages": [ ... ],
  "seo": { ... },
  "nav": [ ... ]   // optional
}
```

## client (required)

Business identity and contact information.

| Field | Type | Required | Description |
|---|---|---|---|
| name | string | yes | Business name (used in header, footer, metadata) |
| tagline | string | yes | One-line tagline |
| description | string | yes | Meta description for SEO (appears in search results) |
| email | string (email) | yes | Primary contact email |
| phone | string | no | Phone number (any format) |
| address | string | no | Physical address |
| bookingUrl | string | no | Scheduling/booking URL |
| social.facebook | string | no | Facebook page URL |
| social.instagram | string | no | Instagram profile URL |
| social.linkedin | string | no | LinkedIn page URL |
| social.twitter | string | no | X/Twitter profile URL |

Only non-empty social links are rendered. Omit or pass empty string for unused platforms.

## tokens (required)

Design tokens injected as CSS custom properties. Controls the entire visual identity.

| Field | Type | Description |
|---|---|---|
| primaryHue | string | HSL hue component (0–360), e.g. "220" |
| primarySaturation | string | HSL saturation, e.g. "70%" |
| primaryLightness | string | HSL lightness, e.g. "50%" |
| secondaryHue | string | HSL hue for secondary color |
| secondarySaturation | string | HSL saturation for secondary color |
| secondaryLightness | string | HSL lightness for secondary color |
| accentHue | string | HSL hue for accent color |
| accentSaturation | string | HSL saturation for accent color |
| accentLightness | string | HSL lightness for accent color |
| fontHeading | string | Google Fonts name for headings (e.g. "Playfair Display") |
| fontBody | string | Google Fonts name for body text (e.g. "Inter") |
| radius | string | CSS border-radius value (e.g. "0.5rem") |

The neutral scale (background, foreground, muted, border) derives automatically from the primary hue. The token system maps: tokens → CSS custom properties on `<html>` → shadcn/Tailwind theme → utility classes.

**Common palettes:**
- Professional/conservative: primary hue 210–220, low saturation secondary, gold/amber accent
- Warm/trustworthy: primary hue 200–215, high saturation, orange accent
- Bold/creative: primary hue 340–360, sage/green secondary, coral/warm accent
- Clean/minimal: primary hue 0 (achromatic), very low saturation, single accent pop

**Supported Google Fonts:** Any font available on Google Fonts. Common choices: Inter, DM Sans, Sora, Nunito, Playfair Display, Lora, Merriweather, Poppins, Raleway, Open Sans, Roboto.

## pages (required)

Array of page definitions. At least one page must have slug `"/"`.

| Field | Type | Required | Description |
|---|---|---|---|
| slug | string | yes | Route path: "/" for home, "/about", "/services", etc. |
| title | string | yes | `<title>` tag content and metadata title |
| description | string | no | Page-level meta description (overrides client.description) |
| sections | array | yes | Ordered array of section definitions (min 1) |

Each page generates a `page.tsx` file at the corresponding route. The slug determines the file path:
- `"/"` → `src/app/page.tsx`
- `"/about"` → `src/app/about/page.tsx`
- `"/services"` → `src/app/services/page.tsx`

## sections

Each section has a `type` (component to render) and `props` (data passed to it).

```json
{
  "type": "hero",
  "props": {
    "headline": "Welcome",
    "subheadline": "We build things.",
    "ctaText": "Get Started",
    "ctaHref": "/contact"
  }
}
```

### Available section types and their props

**`eyebrow` (string, optional) is accepted by every type except `footer`** and is not repeated
in the tables below. It renders as a small uppercase kicker above the section's heading.


#### hero
Full-viewport hero with headline, subheadline, and CTA button.

| Prop | Type | Required | Description |
|---|---|---|---|
| headline | string | yes | Large heading text |
| subheadline | string | yes | Supporting text below headline |
| ctaText | string | yes | Button label |
| ctaHref | string | yes | Button link target |
| backgroundImage | string | no | URL for cover background image (adds dark overlay for text contrast) |

#### about
Company/founder story section with optional mission statement.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| story | string | yes | Multi-paragraph story (use `\n\n` between paragraphs) |
| founderName | string | no | Founder/owner name |
| founderRole | string | no | Founder/owner title |
| founderImage | string | no | Photo URL |
| mission | string | no | Mission statement (renders in a highlighted card) |
| pullQuote | string | no | A line lifted out of the story, set large against a rule |

#### services
Grid of service cards with icons.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Text below heading |
| services | array | yes | Array of service objects |
| services[].title | string | yes | Service name |
| services[].description | string | yes | Service description |
| services[].icon | string | no | Lucide icon name (see list below) |

**Available icons:** Palette, Code, BarChart3, Users, Globe, Shield, Zap, Heart, Star, Settings, MessageSquare, TrendingUp, Briefcase, Camera, PenTool, Layers, Monitor, Smartphone, Mail, DollarSign, Award, BadgeCheck. Unrecognized names fall back to Sparkles — except in `credentials`, which falls back to BadgeCheck.

#### portfolio
Grid of project cards with images and optional tags.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Text below heading |
| projects | array | yes | Array of project objects |
| projects[].title | string | yes | Project name |
| projects[].description | string | yes | Brief description |
| projects[].image | string | yes | Image URL (renders at aspect-video) |
| projects[].tags | string[] | no | Category tags shown as badges |
| projects[].link | string | no | URL (makes entire card clickable) |

#### testimonials
Stacked testimonial cards with alternating alignment.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| testimonials | array | yes | Array of testimonial objects |
| testimonials[].quote | string | yes | The testimonial text |
| testimonials[].author | string | yes | Person's name |
| testimonials[].role | string | no | Job title or role |
| testimonials[].company | string | no | Company or location |
| testimonials[].avatar | string | no | Photo URL |

#### contact
Contact form with info sidebar.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Text below heading |
| email | string | yes | Displayed email address |
| phone | string | no | Phone number |
| address | string | no | Physical address |
| showForm | boolean | no | Show contact form (default: true) |

Form submits to `/api/contact`, which on a deployed site is the one dynamic route, handled by
`src/worker.ts`. Requires `RESEND_API_KEY` for email delivery (logs to console if unset).

Spam protection is **not a spec field**. If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set at BUILD,
the form renders a Cloudflare Turnstile widget and sends its token; if it is not, the form
behaves exactly as it did before Turnstile existed. The site key is created during per-client
zone setup, long after a spec is written and approved, so it is deliberately kept out of
`SiteSpec` — see `src/components/ui/turnstile.tsx`.

#### footer
Full footer section. **The site layout already renders a footer from `clientConfig` on every
route**, so including a `footer` section in a page renders a *second* one inline. This is a
defect, not a preference: QA's check 8 blocks any page with more than one `<footer>` (or
`<header>`) landmark. The archetype skeletons in `src/lib/analysis/structure.ts` listed
`footer` until 2026-09-06, which is why every site generated before then shipped two stacked
footers. The type stays in the palette for the rare page that genuinely needs an inline
footer and no layout one; it is not part of any default order.

| Prop | Type | Required | Description |
|---|---|---|---|
| companyName | string | yes | Business name |
| copyright | string | yes | Copyright line |
| navLinks | array | yes | Array of `{ label, href }` objects |
| socialLinks | object | yes | `{ facebook?, instagram?, linkedin?, twitter? }` |
| tagline | string | no | Tagline text |

#### faq
Accordion-style FAQ section.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Text below heading |
| items | array | yes | Array of FAQ objects |
| items[].question | string | yes | Question text |
| items[].answer | string | yes | Answer text |

#### cta-band
Full-width call-to-action band. Place between sections for visual breaks.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | CTA heading |
| subheading | string | no | Supporting text |
| ctaText | string | yes | Button label |
| ctaHref | string | yes | Button link target |
| variant | string | no | "primary" (default), "secondary", or "accent" |

#### stats
Horizontal stats row with animated count-up.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | no | Section heading (omit for a compact row) |
| stats | array | yes | Array of stat objects |
| stats[].value | string | yes | Stat value (e.g. "500+", "4.9", "24/7") |
| stats[].label | string | yes | Stat label |

Values with a leading number animate on scroll (count-up effect). Non-numeric values display statically.

#### pricing
Rates table. One to four tiers; the grid follows the tier count, so two tiers centre rather
than leaving a gap in a three-up row.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Supporting text below heading |
| note | string | no | Fine print below the table (what the price excludes, billing terms) |
| tiers | array | yes | Array of tier objects |
| tiers[].name | string | yes | Tier name |
| tiers[].price | string | yes | Price as written (`"$1,200"`, `"0.65%"`, `"Custom"`) |
| tiers[].cadence | string | no | Unit beside the price (`"/mo"`, `"/yr"`, `"of assets"`) |
| tiers[].description | string | no | One line on who the tier is for |
| tiers[].includes | string[] | no | What the tier includes; renders as a checklist |
| tiers[].ctaText | string | no | Button label — renders only alongside `ctaHref` |
| tiers[].ctaHref | string | no | Button link target |
| tiers[].featured | boolean | no | Rings the card in the primary colour |

#### feature-list
Differentiator list — two columns of icon, title and paragraph. Deliberately not a card grid:
`services` owns that shape, and a differentiator is a claim to read rather than an item to scan.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Supporting text below heading |
| features | array | yes | Array of feature objects |
| features[].title | string | yes | Feature title |
| features[].description | string | yes | Supporting paragraph |
| features[].icon | string | no | Lucide icon name from the shared `ICON_MAP`; unknown or absent falls back to `Sparkles` |

#### credentials
Third-party backing — licences, certifications, registrations, memberships, awards. Rendered as
a bordered plate grid on a tinted band.

Industry-neutral by construction: the shape is *a claim, who issued it, and how to check it*,
which is the same shape for a CFP® mark, a state contractor licence, a Google Partner badge and
a bar admission. Industry specificity belongs to archetypes and templates, never to a section
type.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | yes | Section heading |
| subheading | string | no | Supporting text below heading |
| note | string | no | Fine print below the grid (the "registration does not imply endorsement" line) |
| credentials | array | yes | Array of credential objects |
| credentials[].name | string | yes | The credential as it is properly written |
| credentials[].issuer | string | no | Body that issued or maintains it |
| credentials[].detail | string | no | Holder, registration number, or year held since |
| credentials[].href | string | no | Public register or verification page; renders a "Verify" link, `target="_blank"` |
| credentials[].logo | string | no | Issuer mark; replaces the icon when present |
| credentials[].icon | string | no | Lucide icon name from the shared `ICON_MAP`; unknown or absent falls back to `BadgeCheck` |

`href` is the field that earns the section. An unverifiable credential is just a claim, and the
value here is that a visitor can click through to the issuer's own register. It stays optional
because plenty of real credentials have no public lookup.

#### disclosure
Regulatory and legal disclosure text, with the linked documents that go with it.

| Prop | Type | Required | Description |
|---|---|---|---|
| heading | string | no | Section heading (omit for an unheaded fine-print block) |
| body | string | yes | Disclosure text (use `\n\n` between paragraphs) |
| links | array | no | Array of `{ label, href }` — Form CRS, ADV Part 2A, privacy policy |
| variant | string | no | "fineprint" (default) or "panel" |

`fineprint` is the quiet full-width block above the footer, where most disclosures belong.
`panel` is the bordered, full-size treatment for the load-bearing case — a "this is not
investment advice" line directly under a pricing table, where burying it defeats the purpose.

**The generator never writes a disclosure.** Adequacy, currency and jurisdiction are the
client's counsel's business; `body` carries text the client supplied, verbatim. The schema
checks shape and nothing else.

## seo (required)

Site-level SEO configuration.

| Field | Type | Required | Description |
|---|---|---|---|
| siteName | string | yes | Site name for OG tags |
| defaultImage | string | no | Default OG image URL |
| keywords | string[] | no | SEO keywords |

## nav (optional)

Navigation links for the header and site layout.

```json
"nav": [
  { "label": "Home", "href": "/" },
  { "label": "About", "href": "/about" },
  { "label": "Services", "href": "/services" },
  { "label": "Contact", "href": "/contact" }
]
```

If omitted, nav is derived automatically: "Home" for the root page, plus one entry per non-root page using each page's `title` and `slug`.

## Default page structures

Standard productized sites typically include these pages:

**Home** (slug: "/"): hero → services → stats → cta-band → testimonials

**About** (slug: "/about"): about (with founder info and mission)

**Services** (slug: "/services"): services → faq or cta-band

**Portfolio** (slug: "/portfolio"): portfolio

**Contact** (slug: "/contact"): contact

These are suggestions, not requirements. Any combination of sections on any page is valid.

## Validation rules

The Zod schema enforces:
1. At least one page must have slug `"/"`
2. Each page must have at least one section
3. Section type must be one of the 14 valid types
4. `client.email` must be a valid email format
5. **Every required prop is present, every prop has the right type, and no unrecognised prop
   is accepted** — `sectionSchema` is a discriminated union on `type`, so each section is
   checked against its own component's prop schema in `section-props.ts`

Rule 5 previously read "all required fields must be present and non-empty" and was false in
both halves. `props` was `z.record(z.string(), z.unknown())`, so section props were entirely
unchecked: a `hero` with `{}` and a typo'd `headliine` both parsed clean and failed at
`next build` — downstream of the REVIEW gate, after a human had approved a spec that could
not build.

**"Non-empty" is still not enforced, and deliberately so.** The schema constrains *shape*,
never *content*: no min-lengths, no content enums, nothing that tells the generator what to
write. Empty and placeholder copy is caught by the copy rules at ANALYSIS, not here.

`section-props.ts` is hand-written beside the components rather than derived from them, so
`section-props.conformance.ts` asserts at compile time that each schema is structurally
identical to its component's exported interface. Adding a prop to a component without adding
it to the schema is a `tsc` error, not a build failure three stages later.

## Where a spec comes from

A hand-written spec is one path in; the other is `src/lib/analysis/` — token extraction,
archetype/structure selection, model-driven copy generation, and the deterministic rail,
copy-floor and validation pass that produces `spec.json`. Every run writes a provenance
folder at `Business/clients/<slug>/analysis/<ISO-timestamp>/` (`prompt.md`, `input.json`,
`structure.json`, `tokens.json`, `run.json`, `spec.json`, `linter-report.json`, `flags.md`).
No content rules live here — see `Business/tasteled/tickets/008-analysis-runtime-mechanism.md`.

## Usage

```bash
# Run the assembler CLI
npx tsx src/lib/assembly/assemble.ts path/to/spec.json

# Or import programmatically (Phase 10)
import { assembleFromSpec } from "./assemble";
const result = await assembleFromSpec("spec.json", process.cwd());
```

The assembler writes `src/lib/client-config.ts` and one `page.tsx` per page entry. It does not run `pnpm build` — the BUILD pipeline stage handles that separately.
