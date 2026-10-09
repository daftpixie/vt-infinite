# ADR 0006: Landing mode

- Status: proposed (stage 5L, part A pull request)
- Date: 2026-10-08
- Decider: Matthew J Adams

## Context

The first public release of vt-infinite.com is a single landing page, a privacy notice and the email-list endpoints. Everything already built (Words, Code, the Record, Vibes, Agency, Contact, governance, the plan, Marrs Rover, the policies) stays in the codebase, tested and switched off, until Matthew opens the full site. The full build must keep working unchanged when the switch is unset.

## Decision

- **One switch, `SITE_MODE`** (`lib/mode.ts`). Unset, empty or `full` is the full build, unchanged. `landing` is the landing release. Any other value fails the build (`scripts/check-release.mjs`) and is treated as `landing` at request time, so a typo closes the site rather than opening it. It is read on the server per request, like the feature flags, and must be set for the build and the runtime alike (Vercel applies a variable to both by default).
- **Allowed paths** (`LANDING_PATHS`): `/`, `/privacy`, `/robots.txt`, `/sitemap.xml` and `/brand/vt-infinite-mark-small.svg` (the favicon). Part B adds the email-list endpoints. `lib/routes.ts` carries a `landing` column with each route's expected status; a unit test checks that its 200s are exactly `LANDING_PATHS`, and the end-to-end suite requests every route in the table against a server started with `SITE_MODE=landing`.
- **Two layers.** `proxy.ts` denies every other path before anything renders: APIs get an empty 404, everything else a self-contained 404 page that links only to `/`. It does not depend on any page the build prerendered, so it is correct even when a full build is started in landing mode (as the end-to-end suite does). Each full-site page also calls `fullSiteOnly()` and each route handler returns `landingNotFound()` first; `tests/unit/landing-gate.test.ts` fails if a route under `app/` does neither.
- **Old URLs.** The 410 list still applies, with a landing variant of the explanatory page that links only to `/`. The two 308 redirects in `next.config.ts` (`/origin`, `/partners`) are unchanged; they run before the proxy, so in landing mode they lead to a 404 until the full site opens.
- **Scheduled refresh.** `/api/cron/refresh` answers 404 in landing mode and contacts nothing.
- **Robots and sitemap.** `/robots.txt` exists only in landing mode and allows `/` and `/privacy` only. The sitemap lists those two pages. Every page still carries `noindex` (see Open questions).
- **Page** (`components/landing/`). The stacked lockup is inlined byte for byte from `public/brand/vt-infinite-lockup-stacked.svg` (it carries `role="img"` and the label "VT Infinite") inside the page's `h1`; the small mark is the favicon. The acrostic has a visually hidden `h2` "Heart. Mind. Hands." and an ordered list of three items. Each item is one run of inline text ("Heart defines the purpose.") in a box as narrow as its longest word, so CSS, not `<br>`, puts one word per line; the period after the bold word is `aria-hidden`. The bold is set in CSS, because `<strong>` splits the sentence into two nodes in Chromium's accessibility tree. The three columns share one size and leading, so their lines sit on one grid. Below a threshold computed from the longest word (in `ch` and `rem`, so it scales with enlarged text) all three stack at once, never two and one. Copy and links come from `content/landing.json`, validated at build time (`lib/landing.ts`): https only, no credentials, query or fragment; one word per line; each sentence ends with a period.
- **Release check (L3).** The plan activation gate is generalized as `scripts/check-release.mjs`, still the `prebuild` script. With `SITE_MODE=landing` it runs `tests/unit/landing-release.test.tsx`, which renders every landing page inside the root layout, plus the 404 and 410 pages, and fails if any placeholder would render. With `PLAN_ENABLED=true` it runs the plan gate as before.

## Consequences

- A landing build fails today, by design: the privacy notice at `/privacy` is a placeholder until part B supplies the versioned notice. `tests/unit/landing-release.test.tsx` pins that this is the only gap.
- The email form is not built yet; the page shows "Updates sign-up opens soon", the wording for the closed form.

## Open questions

- **Indexing.** The root layout's `noindex` ("until cutover") is unchanged in both modes. Should the landing page be indexable once it is on vt-infinite.com?
- **Redirects.** Should `/origin` and `/partners` keep redirecting (308) to pages that answer 404 in landing mode, or answer 410 until the full site opens?
