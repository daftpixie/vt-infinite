# ADR 0011 — The Signal: bounded site measurement and public aggregates

Decided by Matthew J Adams, 31 October 2026. Implementation proposed in this feature PR. Production release remains Matthew’s decision.

## Authorized change

Matthew’s current instruction supersedes the earlier blanket analytics prohibition **only** for Plausible cookieless pageview measurement and selected public aggregates. Its daily, site/device-specific visitor/session distinction is acceptable. Cookies, persistent visitor identification, cross-site tracking, behavioral profiling, custom properties, replay, visitor histories and patient/member data remain excluded. No daily unique-visitor counts are added or presented as deduplicated people. All other privacy and release gates remain in force.

This public excerpt contains only that instruction and the resulting implementation contract. The private product and brand documents, their locations, draft text, identifiers and provider configuration are excluded.

## Collection hold found during implementation

The supplied site-specific script was retrieved read-only on 31 October 2026. Its v37 code sends `engagement` containing scroll depth and time engaged, outside the documented `transformRequest` hook. Setting the three optional capture options false and dropping non-pageviews in that hook does **not** stop those events. No documented disable option for that path was found. The optional measurements in the supplied script also default to enabled; the proposed init explicitly overrides them, and the account settings still need checking.

An offline sandbox probe (`node tests/check-plausible-script.mjs /path/to/downloaded-script.js`) observed:

```text
Initial + eligible navigation pageviews: 3 (expected 3).
Private route pageviews: 0 (expected 0).
Unexpected event types: engagement.
```

The probe substitutes the transport and browser environment, never sends a provider request, does not enable localhost capture or change blocking behavior, and prints no payload or provider configuration. This is an installation-contract failure, not a failed authenticated Stats API read.

Consequently `PAGEVIEW_ONLY_SCRIPT_VERIFIED=false` keeps script loading and its CSP permissions off. The release check rejects a production build requesting collection. **Setting `PLAUSIBLE_ENABLED=true` is insufficient in this PR.** A provider-supported fix, a passing offline transport probe (including navigation, blur, hidden tabs and scroll), and a reviewed code change clearing the hold are required. There is no proxy, legacy script replacement, undocumented option or interception of browser networking. Publication can proceed independently with collection off, using authorized existing aggregates if available.

## Configuration and collection design

Both flags default false and require exact `"true"`. Collection additionally requires `VERCEL_ENV=production`, production Node mode, no automated-test marker and a validated `PLAUSIBLE_SCRIPT_SRC`. The URL must be an HTTPS `plausible.io/js/pa-….js` installation path with no query, fragment, credentials or alternate port. The supplied installation URL is entered in the host environment, not committed. `PLAUSIBLE_SITE_ID` and the separate secret `PLAUSIBLE_API_KEY` are server configuration; neither is sent to the module.

The prepared Next.js 16.4 integration puts queue/init in a `beforeInteractive` root-layout Script and the external script in an `afterInteractive` layout client component. Next deduplicates it across navigation. Plausible’s automatic pageviews are the only producer; no manual pageview events are added. Exact published-page paths are allowlisted. The transform drops other events/private routes, strips query strings and fragments, reduces external referrers to their origin, removes custom properties and ignores internal referrers. All three optional capture options and localhost capture are false. These protections do not resolve the v37 engagement defect; the installation remains held.

The existing CSP is retained, including its existing inline-bootstrap allowance; this change does not add or broaden inline permissions. Once the hold clears, the only additions are the validated installation script’s exact URL and `https://plausible.io/api/event` in `connect-src`. No wildcard, proxy, vendor dashboard or origin-wide script permission is added. Moving the pre-existing inline allowance to nonces remains separate existing work.

## Aggregate contract and time

The server uses only POST `https://plausible.io/api/v2/query`, metric `pageviews`, an exact public-page allowlist and explicit time ranges. The public handler takes no query parameters. No source payload, authorization header, API key or site identifier appears in the response, client bundle or errors. Redirects are refused; reads have an 8-second deadline and 512 KiB response cap. Source pagination must be complete or the whole historical read fails.

- **BPM:** preceding 5 elapsed minutes divided by 5, a five-minute average. Values are exact multiples of 0.2, displayed to at most 1 decimal.
- **Rhythm strip:** 24 consecutive observed 1-hour buckets, anchored to the historical snapshot’s end. One SVG point per bucket midpoint; vertical position is count / displayed peak, from a zero baseline. Straight connecting lines imply no intra-bucket event times. Zero stays at the baseline. The sweep highlights the existing line and never creates or changes data.
- **Cardiac output:** sum of those 24 buckets, the exact preceding 24 elapsed hours at the historical read.
- **Stress test:** maximum of those same 24 hourly counts. This is the peak among the displayed fixed buckets, not an exhaustive sliding-window peak, server-capacity assessment or load test.
- **Circulation:** pageview counts for that same 24-hour range, attributed to the source of the visit’s first pageview (`visit:source`). Only a closed list of general source names is published. Raw campaign values, unknown names and sources below 5 pageviews become “Other sources”; a grouped count below 5 is withheld. No individual referrer dimension is requested or exposed.

Windows are half-open `[start,end)`, aligned to whole seconds. The API’s inclusive end is `end − 1 second`. Twenty-four separate aggregate queries avoid ambiguous local hourly labels during daylight-saving clock changes. Each bucket is exactly 3,600 elapsed seconds. The existing configured site timezone (`SITE_TIME_ZONE`) formats all visible timestamps; operators must match Plausible’s Reporting Timezone to it. UTC ISO timestamps accompany the visible dates in `<time>`. Recent and historical windows/read times are shown separately because their caches have different freshness.

## Shared refresh and durable last good

The module reuses `site.public_snapshots`, restricted read/refresh credentials and strict projection validation. Migration 0002 adds an atomic Postgres lease per snapshot tier. Each successful claim consumes the full 60-second recent or 5-minute historical interval, including on failure. Concurrent requests in an instance share a promise; other instances read the same durable projection and only one wins a refresh lease. Missing database/lease privileges fail closed; no ephemeral production/demo fallback is available. Snapshot keys are runtime-scoped to site and public-page population, so changing either cannot expose an unrelated cached projection.

Normal maximum demand is 60 recent plus 25 × 12 historical/source queries per hour: **360 requests/hour**, below Plausible’s documented default 600/key/hour. Historical requests run at concurrency 4. Other consumers of the same key consume the remaining budget. Retry-After is honored up to 24 hours; authentication/subscription failures wait at least 1 hour. A failure keeps the original source read time and produces stale/unavailable, never a zero. Successful empty responses produce valid zeros. Browser polling stops while hidden, ages retained data on poll failures and removes the module on a 404. API responses use `no-store` so flag-off cannot expose an intermediary’s cached projection.

## Display, privacy notices and delivery

One `SitePulse` renders compact on the landing release and expanded on the full homepage, preserving the acrostic, mark, figures and now-playing feature. The module begins still, has start/pause, stops in hidden tabs, respects reduced motion, uses no flashing or sound and has a conventional count table with native keyboard/touch details. The complete initial snapshot is server-rendered, including stale/unavailable states; without JavaScript the controls are hidden and the table still works. No animation-frame announcements are made.

`/api/pulse` is the only added landing allowlist entry and is separately gated in the route table, proxy and handler. Unrelated full-site routes remain closed. Historical `landing-1`/`landing-2` notices remain renderable unchanged. New `landing-signal-1` through `landing-signal-8` versions encode now-playing, actual collection and publication independently; the collection hold therefore selects a collection-off notice. The full-site measurement notice is `full-signal-1` with explicit states; the existing unapproved participation-policy placeholder remains. No claim of no data processing or universal legal compliance is made.

Documentation checked at build time: [script/init](https://plausible.io/docs/script-extensions), [Stats API v2 and limits](https://plausible.io/docs/stats-api), [data processing](https://plausible.io/data-policy), [plans](https://plausible.io/docs/subscription-plans), [Vercel variable types](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [environment management](https://vercel.com/docs/environment-variables/managing-environment-variables). Installed Next.js 16.4 Script documentation was read locally. Account identity, Reporting Timezone, credentials, entitlement and authenticated connectivity cannot be confirmed without an authorized successful API response; none is claimed.
