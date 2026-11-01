# ADR 0011 — The Signal: bounded collection and public aggregates

Revised 1 November 2026 under Matthew J Adams’s Signal follow-up instruction. Production release remains Matthew’s decision. This excerpt contains only the authorized public contract and implementation decisions, with private references and provider configuration excluded.

## Privacy boundary and selected transport

The earlier blanket analytics prohibition is superseded for this bounded Plausible integration. Matthew’s follow-up also supersedes the earlier pageviews-only ceiling: standard aggregate engagement can be included **only** if its transport satisfies the same privacy restrictions. An engagement event name does not establish either profiling or safety.

Cookies, persistent visitor identification, cross-site tracking, behavioral profiles, replay, identifying campaign/custom-property values, and patient/member data remain prohibited. Plausible’s limited daily, site/device-specific visitor/session distinction is acceptable. No daily unique-visitor counts are added together or represented as deduplicated people.

The implementation chooses the **documented browser Events API with pageviews only**. It does not load the vendor script or collect scroll/time engagement. The old `PAGEVIEW_ONLY_SCRIPT_VERIFIED` constant and unconditional production refusal are removed after regression testing this transport. This is a supported alternative authorized by the follow-up, not a provider-script patch, legacy installation, proxy or browser-network interception.

## Why the supplied script was not selected

The current supplied v37 script was retrieved read-only and tested outside the public working tree with an offline substituted transport. Its normal pageview transform can sanitize the page URL and referrer. Its engagement transport bypasses that hook. A focused scenario replaced a public URL with an admin URL, scrolled and blurred the tab; it emitted engagement using the previous public URL while incorporating activity from the private context. Therefore checking only payload URL strings or accepting the event name does not prove private-route exclusion.

Sanitized evidence from `node tests/check-plausible-script.mjs /path/to/downloaded-script.js`:

- Event types: `pageview`, `engagement`.
- Field names: `d`, `e`, `n`, `r`, `sd`, `u`, `v`.
- Private-context emissions after replace/scroll/blur: **1**, route-exclusion scenario failed.

No supplied provider bytes were changed or committed. No synthetic event reached the production site. No documented option was found to route those engagement sends through the necessary policy filter. The [Events API](https://plausible.io/docs/events-api) was assessed and selected to make the permitted transport completely explicit.

## Collection contract

A single root-layout client component observes Next.js pathname snapshots. It handles initial load, push/replace navigation and back/forward without patching History, fetch or XHR. A ref retains only the latest **approved public** path and a sent bit, not a path history or identity. Private paths clear that state without being retained. Same-path query/fragment changes, hydration/effect replay, ordinary rerenders, module polling, scroll and blur send no event. Returning from a private route can count a new public view. Hidden initial/navigation views wait until visible; private routes never become pending events. A real back/forward-cache document restoration counts once.

Each request is a direct native POST to `https://plausible.io/api/event`, with `Content-Type: text/plain`, `credentials: omit`, `referrerPolicy: no-referrer`, `redirect: error` and keepalive. The only JSON fields are `name=pageview`, the configured public `domain`, sanitized absolute `url`, and an optional external `referrer` origin. Page queries/fragments, internal referrers, referral paths/queries/fragments and all custom properties are excluded. There is no Stats API key, Authorization header, cookie, stored ID or invented IP/User-Agent. The browser supplies its normal IP/User-Agent to Plausible, as documented; the application does not infer or construct visitor identity.

The collector reads the existing `plausible_ignore` opt-out key without writing analytics storage. It respects DNT/GPC, automation and localhost exclusions and treats unavailable opt-out storage conservatively. A failed/blocked request is not retried, rerouted or proxied. Optional outbound-link, download and form capture remain off: no such listeners or event producers are installed. Ordinary browser/visitor blocking stays effective.

`PLAUSIBLE_ENABLED` must be exactly `"true"`, `VERCEL_ENV=production`, Node mode production, with no automated-test marker and a valid `PLAUSIBLE_SITE_ID`. Publication uses independent exact-true `PUBLIC_PULSE_ENABLED`. Both default false; both hosted flags remain false while staging. `PLAUSIBLE_SCRIPT_SRC` remains the supplied installation-reference variable but is not loaded by this collector. The site identifier is intentionally public **only** as the Events API domain when collection is enabled; it is not a credential. The Stats API identifier/key remain absent from the aggregate endpoint and display bundle.

CSP adds only the exact `https://plausible.io/api/event` connect endpoint when collection is enabled. No third-party script origin, wildcard, proxy or new inline allowance is added. The project’s existing inline bootstrap policy is retained. Build-time CSP uses the configured production policy rather than the runtime test-exclusion gate: Vercel supplies `CI=1` at build time, which must not bake a blocking CSP into an otherwise enabled production deployment. Vercel’s CI build marker also must not remove the collector from prerendered public pages. Explicit Vitest/Playwright markers, non-production Node modes and browser automation guards prevent test collection instead. This distinction has a regression test.

## Aggregate backend and request budget

The server adapter remains POST `https://plausible.io/api/v2/query`, metric `pageviews`, fixed public-page filters and explicit windows. The public handler accepts no query/filter/site/URL inputs. Redirects are refused; reads have an 8-second deadline and 512 KiB cap. Raw response/error data, authorization and credentials never reach the browser or public logs. Source pagination must be complete or the historical read fails.

- **BPM:** preceding 5 elapsed minutes divided by 5, explicitly a five-minute average. Multiples of 0.2 display to at most 1 decimal.
- **Cardiac output:** sum of 24 consecutive full elapsed-hour buckets, the preceding 24 hours at the historical cutoff.
- **Stress test:** maximum of those displayed hourly buckets. It describes volume, not server capacity, a load test or an exhaustive sliding-window peak.
- **Circulation:** pageview counts in the exact same 24-hour window, attributed to a visit’s first source. Only closed general labels survive. Unknown values and sources below 5 become “Other sources”; a grouped total below 5 is withheld. Individual referral URLs and identifying campaign values are never published.

Windows are half-open `[start,end)`, second-aligned; the API’s inclusive end is `end − 1 second`. The 24 separate hourly queries preserve exact elapsed-hour durations across both daylight-saving transitions, with no ambiguous local-hour parsing. Visible timestamps include seconds and the configured `America/New_York` timezone; their `<time>` values preserve the original UTC timestamps. Recent and historical windows/read times remain separate.

The existing restricted durable snapshot store, atomic Postgres leases, per-instance coalescing and rate-limit backoff are preserved. At most 60 recent plus 25 × 12 historical/source queries per hour gives **360 requests/key/hour**, below the documented default 600; other consumers/manual probes share the remaining budget. Historical concurrency remains 4. No optimization or backend rewrite was introduced. Failures retain last-good values and source times as stale, never fabricated zeros. Successful empty results are valid zeros. Missing database leases fail closed. Publication-off serves no cached snapshot or upstream request. Visible-browser polling pauses while hidden and removes the module after a disable response.

## Stylized waveform and evidence

One `SitePulse` renders both variants, preserving the mark, acrostic, figures and now-playing feature. Each nonzero hourly bucket produces exactly one fixed P/QRS/T-like schematic motif. Count controls amplitude only: `count / displayed peak × 49% of SVG height`. Zero draws a flat baseline. Motif positions are drawing coordinates within a bucket, **not** observed event times; the trace makes no physiological or diagnostic claim and is not a literal heartbeat.

The compact flow is heading, five-minute-average BPM, waveform, status and concise window/read metadata. Expanded Cardiac output, Stress test and Circulation summaries precede evidence. Both variants collapse original hourly counts and mathematical/source explanations behind native details, usable without JavaScript. The module has no fixed-height text clipping. Motion starts only at the reader’s request, pauses, respects reduced motion and hidden tabs, and changes no counts or timestamps. No flashing, sound or frame announcements are added.

Privacy notices describe the selected direct pageview transport, its processing and public output, conditional on actual flags. Historical pre-feature notices remain unchanged. No no-processing or universal-compliance claim is made. `/api/pulse` remains the only added landing allowlist path; unrelated routes stay closed.

## Verification and release boundary

The offline shipped-collector probe emits only `pageview`, fields `domain/name/referrer/url`, with 7 expected initial/navigation/restoration events in its scenario and no private-context or same-path events. Regression tests also invoke the actual root component effect using an offline hook/browser model, without changing blocking flags in a real browser. Application e2e tests keep collection off.

Matthew has confirmed the five Plausible variables, both staging flags false, and the site/timezone setup. Those are not open questions. Hosted SQL setup remains Matthew’s separate pending work: 0001 if absent, then 0002, restricted-role logins and transaction-pooler connections. Applying SQL and setting Vercel variables are different actions.

This environment has no authorized Plausible/database bindings. Consequently authenticated Stats API status/validity/live latency and hosted table/role readiness are not claimed. `scripts/signal-preflight.mjs` makes those remaining read-only checks concrete and emits sanitized status/boolean findings only. No diagnostic endpoint or protection bypass is added. Disposable local Postgres tests exercise real leases, restricted-role projection writes/reads and restart recovery. The PR remains draft while essential hosted runtime verification is outstanding; passing tests alone does not authorize release.

References rechecked for this follow-up: [script options](https://plausible.io/docs/script-extensions), [Events API](https://plausible.io/docs/events-api), [Stats API](https://plausible.io/docs/stats-api), [data processing](https://plausible.io/data-policy). Installed Next.js 16.4 documentation informs root-layout navigation/lifecycle behavior.
