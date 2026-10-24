# ADR 0009: Now playing on the landing page

- Status: proposed (stage 5L-3)
- Date: 2026-10-24
- Decider: Matthew J Adams

## Context

PRD S-1 to S-8 put Spotify "now playing" on `/vibes`, which belongs to the full site. The landing release (ADR 0006) reads nothing upstream.

## Decisions (Matthew, 24 October 2026)

- **Placement.** "Now playing" ships on the landing page at `/`, not only on `/vibes`. This amends ADR 0006's "reads nothing upstream" for this one feature, and only while it is switched on. Matthew created the Spotify app (Web API only). No build session needs or sees its credentials.
- **L1 label, verbatim:** "What is Matty vibing to? ❤️". The emoji is `aria-hidden`, so a screen reader hears only the question.
  - **Brand exception, approved by Matthew.** The build session reported that the label conflicts with brand reference v1.1. §08 allows black and white only ("no third color"), and a color emoji is a third. §11 says never to use hearts as generic ornament, and D7 retires the heart from the company's identity. Matthew chose to keep the label exactly as written. No copy guard fires on it, so `guards/exceptions.json` has no entry; this ADR is the record.
- **L2 placement:** below the publication links and above "Updates sign-up opens soon". The mark, acrostic, motto and links do not move; `tests/e2e/now-playing.spec.ts` compares their boxes with the feature on and off at 1280, 390 and 320 px.
- **L3 default:** while the feature is on, sharing is on. `NOW_PLAYING_SHARING` unset, empty or `on` means sharing; `off`, or any other value, pauses it.
- **Attribution (Matthew).** Spotify's guidelines ask for the logo beside Spotify content. The site may not draw, recreate or approximate it. The track, artist and album names link back to open.spotify.com, and Spotify's official full logo, which Matthew supplied on 24 Oct 2026, attributes them (see "Logo").
- **Cache (Matthew).** Vercel's Runtime Cache, with a lease, chosen over adding a datastore. See "The 30-second bound" for the evidence and its limit.

## Where this differs from the PRD

The order of authority is Matthew's instructions, then the PRD. These rows follow his instructions for this stage.

| PRD | Here |
| --- | --- |
| S-1: encrypted server tokens; scopes `user-read-currently-playing` and `playlist-modify-public` | No database. The refresh token lives only in Vercel's environment (Production, Sensitive); access tokens live in memory. The only scope is `user-read-currently-playing`; playlists (P-1 to P-8) are out of scope. |
| S-4: delete unusable tokens; prompt reconnection in Admin; persist replacement refresh tokens | No Admin and no store. `invalid_grant` caches a "reconnect needed" state that every instance obeys, and logs `Spotify reconnect needed`. A replacement refresh token is used in memory by the instance that received it. It logs `Spotify issued a new refresh token; reconnect may be needed`, without the value. It is lost on the next cold start, which is the limit of having no store. |
| S-5: Spotify's monochrome logo | Spotify's official full logo (icon and wordmark), black or white by theme (see "Logo"). |
| S-7: founder switch | `NOW_PLAYING_SHARING=off`, set in Vercel, takes effect on the next deployment (docs/ops/now-playing.md). |

## Design

- **Flags.** `NOW_PLAYING_ENABLED` (`lib/flags.ts`) is on only for the exact string `true`.
  - Off: the landing page renders exactly as before (the existing landing tests run unchanged against the flag-off server), `/api/now-playing` answers 404, and `/privacy` serves "landing-1".
  - `/api/now-playing` is in `LANDING_PATHS` and `LANDING_FLAGGED_PATHS` (`lib/mode.ts`), in `GATED_PREFIXES` (`lib/access.ts`), and in `lib/routes.ts` with `flag: "nowPlaying"`. The route checks the flag first, in both modes.
  - `/vibes` keeps `fullSiteOnly()`.
- **Client** (`lib/now-playing/client.ts`). Two requests can be built, by two private builders:
  - `POST https://accounts.spotify.com/api/token`, with grant `refresh_token` and client authentication in a Basic header;
  - `GET https://api.spotify.com/v1/me/player/currently-playing`, with no query.

  `assertAllowed` checks the exact method and URL before every send. Redirects are refused (`redirect: "error"`). One deadline of 2.5 s (`CLIENT_TIMEOUT_MS`) covers both requests, and bodies are capped at 128 KiB. `additional_types=episode` is not sent, so the server never asks for episode details.
- **Projection** (`lib/now-playing/projection.ts`). It keeps the track name, the artist names (up to 10), the album name, their open.spotify.com links (checked against `https://open.spotify.com/{track|artist|album}/<22 characters>`), whether it is playing, and the item type. Everything else is dropped before caching. An episode becomes `{ state: "podcast" }` and nothing more. Names are kept as supplied; React escapes them.
  - **Copy safety (N9).** Names go through the same display guards as the publication streams: secrets, private identifiers, long numeric IDs, PBC status and byline (`WITHHOLD_RULES`). Brand words are not applied, since a title is the artist's words, not VT Infinite's. A hit withholds the details, and the page shows only the state; the log names the rule, never the text. A name that mentions suicide brings the verbatim crisis block (`lib/crisis.ts`).
- **Component** (`components/now-playing/`). It is server-rendered in full and works without JavaScript. With JavaScript it polls `/api/now-playing` every 30 s while the tab is visible and stops while hidden. It reuses the plan poller (`lib/plan/poller.ts`). A 404 removes the component.
  - **States, in the PRD's words:** Playing, Paused, Nothing playing, Not sharing right now, Listening to a podcast, Can't reach Spotify right now. An old answer shows "As of N minutes ago", from the server's clock.
  - **Constraints:** tokens from `app/globals.css` only; no image but Spotify's own logo, served from the site's origin; no embed, no animation. The CSP is unchanged.
- **Privacy notice "landing-2".** Served only while the flag is on; otherwise "landing-1", unchanged (`lib/privacy.ts`). The new sentences are in the table below.
- **Release check.** With `NOW_PLAYING_ENABLED=true`, `scripts/check-release.mjs` runs `tests/unit/now-playing-release.test.tsx`. That test fails unless `/privacy` serves "landing-2" with its Spotify sentences and no placeholder renders in any state. Until the logo was supplied it failed, on purpose; it now passes. The script also refuses the test-only synthetic Spotify (`NOW_PLAYING_FIXTURE`) on Vercel.

## Logo

- **Source.** Spotify's official full logo (icon and wordmark), monochrome RGB, from the 2024 full-logo ZIP on Spotify's design page. Matthew supplied it on 24 Oct 2026, and it is committed byte for byte. It is never edited, minified, optimised, inlined, traced or recoloured.

  | File | SHA-256 |
  | --- | --- |
  | `public/brand/third-party/spotify/Full_Logo_Black_RGB.svg` | `b91219c14405166e3667deb7f250df4b939a8a5dbc8460ee9525a75672ba9ec5` |
  | `public/brand/third-party/spotify/Full_Logo_White_RGB.svg` | `31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c` |

  Both have `viewBox="0 0 823.46 225.25"` and no script, link, external reference or embedded image. An inline `<style>` sets the color; the white file uses `fill:#fff`. The CSP is unchanged: `img-src 'self'` serves them, and an SVG loaded as an image runs no script and loads nothing. `tests/unit/spotify-logo.test.ts` pins both hashes, and the end-to-end suite checks the bytes as served.
- **Served.** Only these two paths, only while `NOW_PLAYING_ENABLED=true`, as `/api/now-playing` is served: in `LANDING_FLAGGED` (`lib/mode.ts`), in `GATED_PREFIXES` (`lib/access.ts`), and in `lib/routes.ts` with `flag: "nowPlaying"`. While the flag is off, the proxy denies them in both modes, and a landing build made without the flag rewrites them to 404 (`next.config.ts`). Nothing else under `public/brand/third-party` is served.
- **Theme.** Both variants are in the page, and CSS shows one: white on the dark theme, black on the light. They follow the theme switch and `prefers-color-scheme` like every other figure-and-ground pair. The inline boot script sets the theme before first paint, so the wrong variant never shows. The hidden image is `display: none`, so its alt text "Spotify" is heard once. Black and white only: the end-to-end suite reads the painted pixels in both themes and finds no third color.
- **Size and clear space.** 7.5rem wide (120 px at default text size), never under 70 px. The icon is 218.82 units tall in the file's 823.46-unit width, so half its height is 0.1329 of the logo's width: 15.9 px at 120 px. The padding is 1rem (16 px), never under 9.5 px, measured from the image's edges, which already sit outside the artwork. The end-to-end suite measures width and clear space at 320, 390 and 1280 px in both themes.
- **Where.** Below the track, artist and album, in every state that shows Spotify's metadata (Playing and Paused with details), and nowhere else.

## The 30-second bound (N4, S-3)

**What is shared.** From the Next.js 16.4 documentation bundled with the installed version:
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache-remote.md`: plain `use cache` is in-memory, and "In serverless environments, memory is not shared between instances". `'use cache: remote'` provides "durable caching shared across all server instances", through the platform's cache handler. It requires turning on `cacheComponents`, which changes how every route renders.
- `01-app/02-guides/migrating-to-cache-components.md`: plain `use cache` entries "are discarded when the serverless instance is destroyed".

From Vercel's documentation, read through Vercel's documentation search (the session's network policy refused vercel.com):
- [Runtime Cache](https://vercel.com/docs/runtime-cache) backs `'use cache: remote'` on Vercel.
- [`getCache`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) from `@vercel/functions` gives the same cache "for storing and retrieving data across function, routing middleware, and build execution within a Vercel region". Its interface is `get`, `set` (with a time-to-live), `delete` and `expireTag`. Tag expiry propagates "across all Vercel regions within 300ms".

**Choice.** `getCache` directly, from `@vercel/functions` 3.9.11, pinned. This avoids switching on `cacheComponents` for the whole site. The package's source (`cache/index.js`) uses the request's Runtime Cache on Vercel. Elsewhere it falls back to process memory, with a warning: `Runtime Cache unavailable in this environment`. docs/ops/now-playing.md step 7 has Matthew confirm that line is absent in production.

**How the bound is kept** (`lib/now-playing/service.ts`):
1. A projection younger than 30 s is served as it is.
2. Before reading Spotify, an instance takes a 30-second lease, by Fischer's timed mutual exclusion: check for a lease younger than 30 s; write its own; wait `SETTLE_MS` (250 ms); read it back; go ahead only if it is still its own. An instance whose check-then-write took longer than half the settle time gives up. The lease is never released early, so a failed read still waits out its 30 s.
3. Concurrent requests inside an instance share one read. Each instance also keeps its own 30-second floor if the cache is down.
4. Instances that lose the lease serve the last projection. If they have none, they wait, within the deadline, for the winner's.

**Evidence.** `tests/unit/now-playing.test.tsx` builds several service instances over one shared cache, whose operations yield a random number of turns so instances interleave:
- 12 interleavings: five instances, three bursts of 40 concurrent requests in each 30-second window, over six windows. Exactly one Spotify read per window.
- A randomized spread of 300 rounds over four instances: no two reads less than 30 s apart.

The first version of the lease (write, then read back at once, with no settle wait) failed this test: two instances both read Spotify at the same instant. That is why the settle wait exists.

**Limit.** Fischer's method is correct only if the cache returns the latest write and a rival's write lands within the settle time. Vercel documents neither the Runtime Cache's consistency nor its write latency, and documents it as regional. Two regions, or a cache that answers stale, could each let one read through. Each region would still be bounded by its own lease, and each instance by its own floor. Matthew accepted this limit rather than adding a datastore with an atomic set-if-absent. Keep the project's functions in one region (docs/ops/now-playing.md, step 7).

**Token refreshes.** One read is one GET. About once an hour per instance, a token refresh (`POST` to the token endpoint) comes just before it. A 401 drops the access token without retrying in the same cycle.

## Failure handling (N5)

- **invalid_grant (or invalid_client).** No retry loop. "Reconnect needed" is cached for 7 days and kept for the life of each instance, keyed to a one-way hash of the credentials, so new credentials clear it. The site logs `Spotify reconnect needed`, and visitors see "Can't reach Spotify right now", with no last projection.
- **429.** `Retry-After` is honoured, in seconds, with a default of 60 and a cap of 24 hours, as a shared back-off; the last projection is served meanwhile. A body with `reason: "QUOTA_EXCEEDED"` is logged as a quota, anything else as a rate limit.
- **Expiry.** The estimated expiry is `SPOTIFY_AUTHORIZED_AT` plus six calendar months. Within 30 days of it, every refresh logs `Spotify needs reconnecting by <YYYY-MM-DD>`.
- **Other failures.** The last projection with its age, or "Can't reach Spotify right now". Nobody waits longer than 2.5 s.
- **Logging.** No log line carries a token, code, secret or name; tests check this.

## Step 0: Spotify, as checked on 24 October 2026

The session's network policy refused `developer.spotify.com`. Every point below comes from search-engine excerpts of the cited official pages, which were **not opened**. The response shape was also checked against an unofficial mirror of Spotify's OpenAPI schema (sonallux/spotify-web-api, version 2026.5.31). Matthew should open each page and confirm it before switching on.

| Point | What the excerpts say | Source |
| --- | --- | --- |
| (a) Currently playing | `GET /v1/me/player/currently-playing`, scope `user-read-currently-playing`. 200: `is_playing`, `item` (track or episode, may be null), `currently_playing_type` (`track`, `episode`, `ad` or `unknown`), plus `timestamp`, `progress_ms`, `context` and `actions`, which are dropped. 204 means playback is not available or active. Episodes come as items only when `additional_types=episode` is sent. | [Reference](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track); [OpenAPI schema](https://developer.spotify.com/reference/web-api/open-api-schema.yaml) |
| (a) Development Mode | Since February 2026, Development Mode apps require the owner's Premium and have an authorized-user cap. Endpoint changes for existing apps were postponed. "Get Currently Playing Track" is listed under "Endpoints still available" on the February 2026 changelog (Matthew, read on 24 Oct 2026). | [Feb 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026); [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) |
| (b) Authorization and refresh | Authorization code flow. http redirects are allowed only for loopback addresses (`http://127.0.0.1:PORT`); `localhost` is refused since 27 Nov 2025. The token request's `redirect_uri` must match. The refresh is `POST /api/token` with `grant_type=refresh_token`. **Unverified:** the exact header and body wording of the refresh page. | [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri); [Refreshing tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens); [Code flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) |
| (c) Refresh-token lifetime | Six months from the original authorization, not extended by refreshing; new apps immediately, existing apps from 20 July 2026. An expired token gets 400 `invalid_grant`. Spotify says to discard it and authorize again, without retrying. | [Refresh token expiration, 18 Jun 2026](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration) |
| (d) 429 | The rate limit is a rolling 30-second window; a 429 normally carries `Retry-After` in seconds. Since July 2026 a quota 429's body carries `"reason": "QUOTA_EXCEEDED"`, and the quota is counted per developer account. **Unverified:** whether `reason` sits at the top level or under `error`; the code accepts both. | [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits); [Quota updates](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates); [Jul 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026) |
| (e) Attribution | From Spotify's design page (Matthew, read on 24 Oct 2026): content from Spotify must always be attributed with the logo; partner integrations use the full logo; monochrome, black on light and white on dark; at least 70 px wide on screen; clear space equal to half the icon's height; metadata links back to Spotify; metadata is shown as provided. This session still could not open the page (network policy). | [Design guidelines](https://developer.spotify.com/documentation/design); [Developer policy](https://developer.spotify.com/policy); [Companion app](https://developer.spotify.com/documentation/commercial-hardware/implementation/requirements/companion-app) |

Further assumptions, untested against the live API:
- Without `additional_types`, an episode answers with `currently_playing_type: "episode"` and a null item. The projection treats either form as a podcast.
- An authorization code is short-lived; docs/ops/now-playing.md says to use it at once.

## Privacy notice "landing-2": the new sentences and their sources

Every "landing-1" sentence stays, with its source in ADR 0008. "landing-2" adds:

| Sentence | Source |
| --- | --- |
| The home page shows what Matthew is playing on Spotify. | `components/landing/LandingPage.tsx` renders `components/now-playing/` while `NOW_PLAYING_ENABLED=true`, the only case in which "landing-2" is served (`lib/privacy.ts`). |
| This site asks Spotify for it. | `lib/now-playing/client.ts`: the server's two allowlisted requests. |
| Your browser does not contact Spotify. | The browser polls `/api/now-playing` on the site's own origin. The page loads nothing from Spotify's servers: no image, script or embed. Spotify's logo is a file served from the site's own origin. The CSP is unchanged (`connect-src 'self'`, `img-src 'self' data:`). `tests/e2e/now-playing.spec.ts` checks, in both themes, that every request, while polling too, goes to the site's own origin. |
| Track links go to Spotify. | The track, artist and album links are open.spotify.com links (`lib/now-playing/projection.ts`). The existing sentence that follows ("When you follow one, you leave this site, and that service's own privacy rules apply") and the referrer sentence cover them as they cover Substack and Discord. |

"This site does not collect anything about you" and "It loads nothing from other websites" stay true: the site keeps nothing about visitors, and the browser loads nothing from Spotify.

## Consequences

- The landing page reads upstream only while the flag is on, and then only the shared projection.
- The official Spotify logo is in place (see "Logo"), so the release check no longer holds the feature; switching on is Matthew's step 7 in docs/ops/now-playing.md.
- CI starts two more servers for the end-to-end suite (`playwright.config.ts`). They answer from a synthetic Spotify, `tests/fixtures/now-playing`.
