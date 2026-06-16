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

**Available icons:** Palette, Code, BarChart3, Users, Globe, Shield, Zap, Heart, Star, Settings, MessageSquare, TrendingUp, Briefcase, Camera, PenTool, Layers, Monitor, Smartphone, Mail, DollarSign. Unrecognized names fall back to Sparkles.

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

Form submits to `/api/contact`. Requires `RESEND_API_KEY` env var for email delivery (logs to console if unset).

#### footer
Full footer section. Note: the site layout already renders a footer from `clientConfig`. Including a `footer` section in a page would render an additional footer inline — typically not needed.

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
3. Section type must be one of the 10 valid types
4. `client.email` must be a valid email format
5. All required fields must be present and non-empty

## Usage

```bash
# Run the assembler CLI
npx tsx src/lib/assembly/assemble.ts path/to/spec.json

# Or import programmatically (Phase 10)
import { assembleFromSpec } from "./assemble";
const result = await assembleFromSpec("spec.json", process.cwd());
```

The assembler writes `src/lib/client-config.ts` and one `page.tsx` per page entry. It does not run `pnpm build` — the BUILD pipeline stage handles that separately.
