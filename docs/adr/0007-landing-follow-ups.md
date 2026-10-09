# ADR 0007: Landing release follow-ups

- Status: proposed (stage 5L-2, pull request 1)
- Date: 2026-10-09
- Decider: Matthew J Adams

## Context

ADR 0006 put the landing release behind `SITE_MODE=landing` and left two questions open (indexing, and the old redirects). A review of the part A pull request found gaps in the landing gate and some accessibility fixes. Matthew also asked that the acrostic read across on phones. This ADR records what changed; ADR 0006 still describes the rest.

## Decisions

- **Indexing (Matthew).** In landing mode, `/` and `/privacy` are indexable (`robots: index, follow` in their own metadata). Every 404 and 410 keeps `noindex`, as does every page of the full build until its own cutover. The root layout is unchanged.
- **Old redirects (Matthew).** `/origin` and `/partners` answer 404 in landing mode and keep their 308s in full mode. The redirects moved from `next.config.ts`, which runs before the proxy and does not know the mode at request time, into the old-URL table (`content/legacy/urls.json`) and `lib/access.ts`. The responses in full mode are the same: 308, a relative `Location`, the query kept.
- **Metadata (F3).** Every full-site page's metadata is `generateMetadata`, which calls `fullSiteOnly()` first, so a landing 404 never carries a full-site title or description. `tests/unit/landing-gate.test.ts` requires it.
- **Files in `public/` (F4).** The proxy now runs on everything except `/_next/static/`. In landing mode only `LANDING_PATHS` and the two font files the stylesheet loads (`LANDING_FONTS`, `lib/mode.ts`) answer; the font licence, `/favicon.ico` and the image optimizer answer 404. A unit test checks `LANDING_FONTS` against `app/globals.css`; the end-to-end suite requests every file in `public/`.
- **Route-level gate without the proxy (F5).** `npm run build:noproxy` makes a landing build (`SITE_MODE=landing`) with the proxy switched off, into `.next-noproxy`, and `tests/e2e/landing-noproxy.spec.ts` requests every route in `lib/routes.ts` against it. Since the build runs in landing mode, its static pages are prerendered as 404s, and the test covers them. Files in `public/` cannot be refused by a page, so a landing build also rewrites each one the landing release does not use to a path with no route (`next.config.ts`, `beforeFiles`), which answers 404 without the proxy. The switch, `VT_TEST_BUILD_WITHOUT_PROXY`, works through `env` in `next.config.ts`, which Next.js fixes into the build; a normal build fixes it to empty, so no run-time variable can turn the proxy off. The release check fails a build that sets it on Vercel. CI runs this build, which also proves that a landing build passes its release check.
- **Acrostic on phones (Matthew, F7).** The three columns stay in a row down to a 360 px viewport at default text size and stack below that, or when enlarged text cannot fit a row. Each column is its longest word plus 2ch (headroom for text spacing, SC 1.4.12). The size steps with the width of the acrostic itself (a container query, breakpoints in rem, which a container query takes from the root), so it follows the reader's text size: body size (16 px at default text size, never less) for phone rows, the next steps up on wider screens and when stacked. No `vw` sizing.
- **Accessibility (F1, F2, F6).** The motto carries `lang="la"` (from `content/landing.json`). The acrostic is a plain `div`, so its hidden `h2` is announced once. The lockup wrapper inside the `h1` is a `span`. The external-link arrow is `aria-hidden`; the visually hidden "(opens another site)" still says it. Footer and landing link lists carry `role="list"`. The theme legend is body size. The landing footer gains a "Home" link, and the landing 404 and 410 pages show the contact address, so help is in the same place on every page (SC 3.2.6).
- **Privacy notice (F8).** See ADR 0008.

## Consequences

- `npm run verify` and CI build twice. The end-to-end suite needs both builds.
- A full build started with `SITE_MODE=landing` (as the end-to-end suite does) relies on the proxy for files in `public/`; a real landing build has both layers.
