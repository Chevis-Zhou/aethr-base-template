# aethr-base-template — state history

Older "Where we left off" entries from [`STATE.md`](../STATE.md), newest first. A historical record: entries describe the code as it was on their date, not as it is now — read the code for current behavior.

## Where we left off (archived entries)

### Mechanical cleanups — 2026-09-04

Three syntax/stale-file fixes, no design decisions:

1. **`src/lib/types.ts` — complete.** Already carried all fourteen section types and `SectionPropsByType` coverage guard (second pass).
2. **`src/app/showcase/page.tsx` — complete.** Already renders all fourteen sections (second pass).
3. **Artifact manifest write path moved to Vault.** `.deploy/` is gone; `manifestPath()` now writes to `/Volumes/External SSD/Vault/Business/clients/<slug>/approved-artifact.json`. Added `--vault-root` CLI flag (defaults to that path). `SPEC.md` updated; no API changes to callers outside this module. Verified: `tsc` clean, `eslint` clean, `pnpm build` completes, dry-run resolves path correctly.

### Eleventh pass — the Maxematics replay (Phase 5). PASSED, after five defects it found.

Phase 5 of `~/.claude/plans/aethr-product-build-spine.md`, 2026-09-06, run as an acceptance
test of the whole pipeline rather than as a build task. It **parked twice before passing**,
and the two parks are the useful part of this entry: everything below was found by pointing
the finished pipeline at a real engagement, and none of it was visible from unit-level work.

Final run: `Business/clients/_replay-maxematics/analysis/2026-09-06T22-44-02.255Z`
(`spec.json` + the REVIEW-approved `spec-approved.json`). QA: `qa-verification/replay-phase5/`.

INTAKE → ANALYSIS (`claude -p`, Opus 5, one attempt, real token extraction) → REVIEW → BUILD
→ QA **STAGED, 0 blockers** → STAGING dry-run clean (56 files, 2.00 MB, artifact `c295deb36a13`).
`assert.ts` 13/13. Nothing run against the live Cloudflare account.

### The five defects

1. **`htmlToText` did not decode `&#x27;`** — the form React SSR emits for an apostrophe.
   Check 1 diffs raw SSR HTML against the hydrated DOM, so **any client whose copy contained
   an apostrophe parked**. The decoder enumerated named and decimal entities and missed the
   hex form. Now decoded by form, any code point.

2. **The positive control could not fail.** It passed only because none of its copy had an
   apostrophe. A fixture covers the characters its client happened to write and nothing else,
   so `verify-qa.ts` now also checks `htmlToText` against a 14-case escape table — verified
   red when the bug is reintroduced.

3. **Every generated site shipped two footers.** `layout.tsx` renders one from `clientConfig`
   on every route, and `footer` was in all three archetype skeletons. `SPEC-FORMAT.md` had
   documented the conflict; nothing enforced it. **Removing it from the skeletons was not
   enough** — the next run added `footer` back on its own, which is ruling 10's open hand
   working exactly as designed. It took all three layers: skeleton stops suggesting it,
   `prompt.template.md` states the layout already renders one, QA's check 8 blocks a page
   with more than one `<header>`/`<footer>`.

4. **Layout assertions and screenshots ran against the unsettled page.** The first replay
   screenshot showed an invisible hero headline and three empty sections on a site rendering
   perfectly — the artifact REVIEW looks at, lying about the build — and every
   `getBoundingClientRect()` assertion was measuring elements still offset by their enter
   transform.

5. **Settling on `document.getAnimations()` was not enough.** The screenshot then caught the
   count-ups mid-flight: **"11 Topics", "9+ Weekly students", "1792 Tutoring since"** against
   intake values of 12, 10+ and 2022 — numbers in no client record, on the artifact REVIEW is
   meant to trust. `framer-motion` drives counters through rAF, which never registers a WAAPI
   `Animation`. `settle.ts` now waits on **rendered-text stability**.

### Decisions worth not re-making

- **This repo is consumed as SOURCE by `aethr-portal`, not as a package.** Its
  `scripts/sync-template.mjs` mirrors `src/lib/{assembly,edit,theme}`, `src/lib/utils.ts`
  and `src/components/{sections,ui,layout}` into its own tree on every build. Two
  consequences that matter here: **the section, ui and layout components must not reintroduce
  `@/` imports** (they would resolve against the portal's `src/`), and a new file those
  components import needs a row in that script's `MIRRORED` list or the portal build fails.
  `assemble.ts` and `generate.ts` are deliberately excluded — they read the filesystem and
  belong to the build.
- **`src/lib/edit/preview.tsx` is not re-exported from `edit/index.ts`.** It pulls in
  fourteen components behind a `"use client"` boundary; a server route importing the
  partition would otherwise drag the whole section tree into a server bundle.

- **A skeleton cannot enforce anything — it is a suggestion, and the model overrides it.**
  This is the single most transferable lesson of the phase. Removing `footer` from the
  skeletons looked like the fix and was not: the very next run put it back, correctly, under
  the open hand. Any structural constraint has to either reach the model as a stated fact
  about the rendering environment, or be caught downstream by a check. Preferably both.
- **A structural fact is not a content rule, and belongs in the template rather than the
  voice doc.** "Do not emit a `footer`; the layout renders one" constrains shape, not what
  the copy says, so it does not breach ruling 10 or the "copy rules live in
  `productized-voice.md`" guard. Prompt generation re-verified idempotent by hash.
- **Rule 2 fires hard on this intake and thins the site.** Run 3 blanked `hero.subheadline`,
  `about.story` and `services.heading` — all for stating "twelve", which is true and is a
  count equal to a spec array length. The client genuinely has twelve topics and any natural
  sentence says so. The floor is behaving as specified; the consequence is that a hero can
  ship with no subheadline. Worth a look before this meets a paying client, but it is a
  ruling, not a bug, so it was left alone.
- **REVIEW fills only the page-level blanks.** The flags sheet marks exactly those as
  "needs a human"; section props the floor blanked ship blank, because the section renders
  without them and filling them is the copy-polish pass 007 removed. An earlier pass in this
  session filled a `services` heading too — that was overreach and is corrected.
- **The replay writes to `_replay-maxematics`, never `max-maxematics`.** Two run folders under
  one client IS 019's rejection record and Phase 6 will read it as one; replay runs are not
  rejections, and the real client folder is a business record. Phase 6's read surface must
  exclude `_`-prefixed client directories. Note the tension: `validateSlug` rejects a leading
  underscore, so a replay client can never be staged under its own folder name — the STAGING
  dry-run used `--vault-root /tmp/replay-vault` with slug `replay-maxematics`.
- **A missing Playwright browser binary throws out of ANALYSIS rather than falling back.**
  The Phase 1 install no longer satisfied the pinned revision (`chromium_headless_shell-1234`).
  Defensible — an uninstalled browser is an install fault, not an unreadable client site — but
  it left a partial run folder that must not be read as a rejection either.
- **Contrast passes 6/6 on the E3-seeded fallback palette**, `accent/accent-foreground` at
  5.29:1. The tenth pass recorded that same pair at 3.23:1 on "the Maxematics purple". The two
  measurements disagree and this pass did not chase it. Do not treat either as settled.

### Known gaps, deliberately not fixed here

- **Token extraction still falls back on the replay's own reference site.**
  `https://edufor.framer.wiki/` yields `no-brand-color-found`, so the replay themes on E3 plus
  house defaults and flags it. Correct behaviour; it also means the replay does not exercise a
  successful extraction end to end.
- **Icons are the generic fallback glyph** across `feature-list`, `services` and `credentials`
  — twelve subject cards carrying one placeholder mark. Reads unfinished. A taste call on
  `icon-map.ts`, not a defect.

---

### Fourteenth pass — the first live DEPLOY, and the defect it exposed. 2026-09-09.

`deploy.ts deploy` and `zone-setup.ts` steps 2–3 ran against the real Cloudflare account for
the first time. All of it worked. The valuable part is what the working version then revealed.

**Target was `replay-maxematics-live.aethrdesign.com`, not `maxematics.org`.** The client's
zone is not on this account — nameservers are Namecheap's, A records point at GitHub Pages,
and `state.md` already carries the ruling that its DNS is client-managed. `deploy` attaches
Worker Custom Domains, which requires the zone in-account, so the client's apex was never a
candidate. Owner elected an AethrDesign-owned host. Client production and staging were probed
read-only and never written to.

Live: version `ceb49bd9`, artifact `5521a1b30f36` (56 files / 2.01 MB), 200, brand token
`--primary-h:262.5` in the document, eleven section anchors, `/api/contact` 405.

### The defect: STAGING detaches production routes

`routesFor()` returns only the preview hostname at stage `staging`, and `wrangler deploy`
reconciles Custom Domains to the config it is given. **A re-stage after DEPLOY removes the
client's apex and `www`, deletes their DNS records, and exits 0.** Measured deliberately:
three domains attached / apex 200 → one `staging` run → one domain / apex **522**, no warning.

The preview URL serves 200 throughout. That is why it is dangerous — the surface an operator
checks first stays green while the client's own domain is down. It cost a full deploy cycle
earlier the same day before it was understood: a concurrent session's staging run silently
undid a completed production deploy, and the first diagnosis (a certificate failure) was wrong.

**The documented recovery path is the trigger.** Spine Phase 0 item 3 says "keep re-staging
working as the recovery path"; for a client past DEPLOY that is the outage. Ticket
`Business/tasteled/tickets/027-staging-detaches-production-routes.md` carries the two candidate
fixes. Nothing is implemented here — the fix is a ruling, not a cleanup.

### Decisions worth not re-making

- **This repo is consumed as SOURCE by `aethr-portal`, not as a package.** Its
  `scripts/sync-template.mjs` mirrors `src/lib/{assembly,edit,theme}`, `src/lib/utils.ts`
  and `src/components/{sections,ui,layout}` into its own tree on every build. Two
  consequences that matter here: **the section, ui and layout components must not reintroduce
  `@/` imports** (they would resolve against the portal's `src/`), and a new file those
  components import needs a row in that script's `MIRRORED` list or the portal build fails.
  `assemble.ts` and `generate.ts` are deliberately excluded — they read the filesystem and
  belong to the build.
- **`src/lib/edit/preview.tsx` is not re-exported from `edit/index.ts`.** It pulls in
  fourteen components behind a `"use client"` boundary; a server route importing the
  partition would otherwise drag the whole section tree into a server bundle.

- **`deploy()` trusting wrangler's exit code is not enough.** The deploy spec already names
  this failure class for a different call — the failure happens after the upload and looks like
  success. DEPLOY has the same shape with no guard. The drift guard protects the bytes; nothing
  protects the routes.
- **A 4-label host gets no working certificate, and that settles an open question.**
  `www.replay-maxematics-live.aethrdesign.com` attaches and even gets a `cert_id`, but TLS
  returns `no peer certificate available` — Universal SSL covers the apex and one wildcard
  level. This is the "probably fine, unverified" note under `previewHostname`, now verified as
  *not* fine. **It does not affect a real client** (their `www.<apex>` is three labels), but it
  means a subdomain can never be a complete DEPLOY rehearsal. A true apex test needs a
  throwaway domain, which would also be the only way to exercise `zone-setup` step 1.
- **"Both or neither" is enforced by nothing.** With `TURNSTILE_SECRET_KEY` on the Worker and a
  build carrying no `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, every submission 403s. Measured, then
  reverted by deleting the secret. The two halves are set in different stages by different
  commands and no check compares them.
- **Never run two sessions against this repo at once.** One Worker, one working tree, one
  `wrangler.jsonc`, one `out/`. A concurrent session overwrote this one's work four times, and
  once published the default `Client Name` template to the shared preview host because its
  self-edit undo had reverted `src/app/page.tsx` while a build was queued behind it. Caught by
  the APPROVE check within the minute, but nothing structural prevented it.
- **The APPROVE check earns its place.** Comparing title and byte count against expectation is
  what caught the wrong-site publish. A staging run that exits 0 says nothing about *which*
  site got staged.

### Known gaps, deliberately not closed here

- `zone-setup` step 1 (`addZone`) and step 4 (`createRateLimitRule`) have still never run live.
  Step 1 needs a domain not already on the account; step 4's PUT replaces the `http_ratelimit`
  entrypoint on a zone shared with the portal, checkout and every preview host.
- The proof host carries a second, hand-written `noindex` transform rule, because the part-5
  suffix rule matches only `-preview.`. Remove it when the host is retired.
- `Business/clients/replay-maxematics/` exists at the real-client path, holding only an
  `approved-artifact.json` written when a run omitted `--vault-root`. SPEC says the manifest
  belongs under the `_replay-maxematics` fixture root. Harmless (no `state.md`, so the portal
  scraper ignores it) but it is the thing SPEC explicitly wanted avoided.

### Sibling defect found while closing out: STAGING builds without assembling

`staging()` runs `next build` and never runs `assembleFromSpec`. The generated sources
(`src/app/page.tsx`, `src/lib/client-config.ts`) are ordinary tracked files that any other
operation can leave in any state, so **STAGING is only correct if a human remembered to assemble
first.**

Verified at the end of this session: `out/` holds the live Maxematics artifact `5521a1b30f36`,
while `src/lib/client-config.ts` reads `name: "Client Name"` and `src/app/page.tsx` carries zero
occurrences of "Maxematics". The working tree does not reproduce what is deployed. A bare
`pnpm build` right now would overwrite `out/` with the default template and the next `staging`
would publish it.

That is not hypothetical — it happened earlier the same day (`logs/02-staging-live.log`): a
staging run shipped the `Client Name` template to the client-facing preview host, because a
concurrent session's self-edit undo had reverted `page.tsx` while a build was queued behind it.
It was caught only because the APPROVE check compares title and byte count, not because anything
in the pipeline noticed.

Two things follow. **`staging()` should assemble from the approved spec as its first step**, so
the build cannot be a function of whatever happens to be in the tree. And **the spec that a
staged artifact was built from should be recorded in the manifest** — `approved-artifact.json`
pins the output bytes but says nothing about the input, so a wrong-site publish is invisible to
the drift guard, which correctly reports a clean match for a perfectly-built wrong site.

Not ticketed here; it belongs with 027 as the same family — the pipeline trusting ambient state
it does not control. Raise as its own ticket rather than folding it into 027, whose question is
narrower.

## Deploy verification snapshots

Moved from `src/lib/deploy/SPEC.md` on 2026-09-18 — point-in-time evidence, not current state.

**Live status, 2026-09-08.** `transform-rule.ts apply --live` is on the zone.
`deploy.ts staging` (no `--dry-run` — this CLI is live by default; there is no `--live`
flag) has now run for real: Worker `site-replay-maxematics`, version
`e612399d-d38a-401a-8747-f36e8831def9`, serving
https://replay-maxematics-preview.aethrdesign.com (Maxematics v1 replay,
`spec-approved.json` from `_replay-maxematics/analysis/2026-09-06T22-44-02.255Z`, artifact
`0ad68a8cb53a`, 56 files / 2.00 MB). Live `GET /` is 200 with the replay headline;
`X-Robots-Tag: noindex, nofollow` is on the response (the zone transform rule);
`GET /api/contact` is 405 / `Allow: POST`. Drift guard re-exercised against that recorded
manifest: `index.html` mutated, `showcase.html` deleted, `injected-after-approve.txt` added
— `deploy` refused with those three names and never called wrangler. Manifest lives under
the fixture vault-root
`Business/clients/_replay-maxematics/Business/clients/replay-maxematics/approved-artifact.json`
so a `replay-maxematics` folder is not created next to real clients (underscore slug is
illegal, and a bare `replay-maxematics/` would be scraped as a client).
