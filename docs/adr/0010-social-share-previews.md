# ADR 0010: Social share previews

- Status: proposed
- Date: 2026-10-25
- Decider: Matthew J Adams

## Context

The landing release is live, and `/` and `/privacy` are indexable (ADR 0007). Their `<head>` had a title and a favicon and nothing else, so a shared link showed no description and no image.

## Decisions (Matthew, 25 October 2026)

- **D1 Description**, verbatim: "Intelligence, conducted — in service of hard problems and the people the tools forgot." This is the approved standfirst (brand reference v1.1 §03, D1; PRD §05). It now lives in one place, `STANDFIRST` in `lib/site.ts`, which Home uses too.
- **D2 Share image:** 1200 × 630 PNG, made from the approved stacked lockup (`public/brand/vt-infinite-lockup-stacked.svg`). It is centred, white on black, with the motto "ad astra per aspera" below it in the site's font and the motto's treatment. No other text or mark: no Spotify logo, no track data, no emoji.
  - The brand reference (§08, "Shared assets") limits small text on an image that must sit on either ground, naming a social card, to #757575 or #767676. D2 asks for the motto's own treatment, which on the dark theme is #909090, at 6.58:1 on black. The card is opaque black, so its text never sits on another ground, and D2 governs. The image follows D2; this is noted for Matthew.
- **D3 X handle:** `@MattyJAdams`, as `twitter:site` and `twitter:creator`.
- **D4 Canonical host:** `https://www.vt-infinite.com`, which the apex redirects to today. Domains and redirects are unchanged.
  - Every absolute URL is built from `metadataBase`, which is `siteUrl()`. That reads `SITE_URL` and defaults to `https://vt-infinite.com`. So the tags name the www host once Matthew sets `SITE_URL=https://www.vt-infinite.com` in Production. No build session sets it (docs/ops/social-previews.md, step 1).
  - On the landing release, that variable also changes the `Sitemap:` line of `/robots.txt` and the `<loc>` entries of `/sitemap.xml`, both to the www host. On the full site, still off, it would also change the feed links, the essays' fallback canonical links and the download commands on the Marrs Rover verify page. Nothing else reads it.
  - The end-to-end suite tests the tags with both values.

## Tags

`landingShareMetadata()` in `lib/social.ts` builds these for `/` and `/privacy` in landing mode only. The landing page sets them in its `generateMetadata` (`app/page.tsx`), and `/privacy`, which exists only in landing mode, sets them in its own. The full site's metadata, every 404 and every 410 carry none of them.

| Tag | `/` | `/privacy` |
| --- | --- | --- |
| `<meta name="description">` | D1 | D1 |
| `<link rel="canonical">` | `https://www.vt-infinite.com` | `https://www.vt-infinite.com/privacy` |
| `og:type` | `website` | `website` |
| `og:site_name` | `VT Infinite` | `VT Infinite` |
| `og:title`, `twitter:title` | `VT Infinite` (the page title) | `Privacy notice · VT ∞` (the page title) |
| `og:description`, `twitter:description` | D1 | D1 |
| `og:url` | as the canonical link | as the canonical link |
| `og:image`, `twitter:image` | `https://www.vt-infinite.com/brand/vt-infinite-share.png` | the same |
| `og:image:width`, `og:image:height`, `og:image:type` | `1200`, `630`, `image/png` | the same |
| `og:image:alt`, `twitter:image:alt` | `VT Infinite` | `VT Infinite` |
| `twitter:card` | `summary_large_image` | the same |
| `twitter:site`, `twitter:creator` | `@MattyJAdams` | the same |

The hosts above assume `SITE_URL` is set (D4). Next.js's Metadata API renders the tags, with relative URLs made absolute against `metadataBase` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`). The `opengraph-image` file convention is not used: it would apply to the full site too, and the image is a fixed file.

## The image

- **File:** `public/brand/vt-infinite-share.png`, 1200 × 630, 8-bit, 27,266 bytes.
- **SHA-256:** `b8df161811531d9ff74dd3f120ecbadfc47e488ab7d1520ec978661d178fec9a`.
- **Script:** `scripts/render-share-image.mjs` renders it once with the Chromium the end-to-end suite already installs (`@playwright/test`, a dev dependency). It adds no runtime dependency and nothing renders at run time.
  - The lockup SVG is read and placed as it is, never edited.
  - The motto is the landing page's: JetBrains Mono from `public/fonts`, embedded in the render, regular weight, #909090, no ligatures, no tracking. It keeps the page's ratio of 20 px type to a 240 px lockup, at 1.6 times (384 px lockup, 32 px motto), with the page's 3rem space step between them.
  - The script refuses to write the file if the font did not load.
- **Byte stability:** rendering is not byte-identical across machines. Two renders in the build session gave the committed bytes, but CI's Chromium rendered `e81447cb713a7b219fd56baa4184b76ff00b12a6cb498e5bb9b3883784d8e14b` from the same script (PR #23, first CI run), because anti-aliasing differs. The committed file is the reference, and `--check` reports whether a local render matches it.
- **Tests:** the specification is checked from the pixels (`tests/share-image-checks.ts`):
  - a 1200 × 630, 8-bit PNG, every pixel a gray;
  - a black ground and corners, the mark reaching white, and the motto below it reaching exactly #909090 and no brighter;
  - centred across within 1 px, and down within 16 px (the layout centres line boxes, and the motto has no capitals).

  `tests/unit/share-image.test.ts` applies it to the committed file and also checks its hash and size (under 300 KB). The end-to-end suite renders the image afresh with the script (`--out`) and applies the same checks to that render.
- **Served:** in `LANDING_PATHS` and in `lib/routes.ts` with `landing: 200`, always on, not behind a flag. It answers 200 `image/png` to a request with no cookies, with the same security headers as every page. The CSP is unchanged.

## Updating the image

1. Change the source (the lockup, with the brand reference) or the script.
2. Run `node scripts/render-share-image.mjs`. It prints the new SHA-256.
3. Give the file a new name, for example `vt-infinite-share-2.png`, so platforms that cache by image URL fetch it again. Update `SHARE_IMAGE_PATH` in `lib/mode.ts`, the route in `lib/routes.ts`, the script's `OUT`, the hash in `tests/unit/share-image.test.ts`, and this ADR.
4. After deploying, re-scrape (docs/ops/social-previews.md, step 3).

## Privacy (M4)

No notice change is needed, and "landing-2" (and "landing-1") stay as they are. The share image is a file on the site's own origin, and the tags are text in the page. Nothing new is collected, stored or loaded from other sites, and no cookie is set. When a platform fetches the page or the image to build a preview, that platform's request reaches Vercel like any visitor's, as the notice's hosting section already says. What the platform does with its own users' data falls under its own rules, which the notice's links section already covers.

## Consequences

- Shared links to `/` and `/privacy` show a title, the standfirst and the image.
- Until `SITE_URL` is set, the tags name `https://vt-infinite.com`, which redirects to `www`.
