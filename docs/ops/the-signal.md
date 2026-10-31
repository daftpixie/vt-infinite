# The Signal operations

Matthew controls secrets and production release. This PR is not authorization to merge, deploy, change hosting or apply migrations. Keep the current `SITE_MODE` unchanged.

## Current activation limit

**Collection is held closed.** The supplied v37 script sends engagement/scroll/time data outside its documented event filter. The offline probe in ADR 0011 reproduced it. This PR deliberately refuses a production build with `PLAUSIBLE_ENABLED=true`. Obtain a supported provider fix, run the offline transport probe, and review a follow-up clearing `PAGEVIEW_ONLY_SCRIPT_VERIFIED` and the release check before collection activation. Do not enable undocumented options, localhost capture, a proxy or blocking bypasses.

Public display is independent. With `PUBLIC_PULSE_ENABLED=true`, authorized pre-existing aggregate data can be displayed with collection off. With missing credentials/storage it shows unavailable; with an old valid snapshot it shows stale with its original time. No demo data is substituted.

## Plausible account checks

1. Select the team owning the site. Confirm the **exact** site identifier; the anticipated domain from the handoff is not assumed or hardcoded. Confirm its Reporting Timezone matches the site's `SITE_TIME_ZONE` (`America/New_York`).
2. Account settings → API Keys → New API Key → **Stats API**. Use the correct team, store the generated credential securely, and enter it as a Secret. The public script installation identifier is not that credential. Do not paste secrets into a PR, issue, terminal transcript or browser code.
3. General → Tracking: outbound links, file downloads and form submissions must all be **disabled**. Account changes affect the served script without a source release. No custom events/properties, captured forms or identifying campaign values should be introduced. Check the engagement blocker with Plausible before clearing the code hold.
4. Confirm Stats API entitlement. The trial includes Business features; continuing this display after the trial currently requires Business or another plan explicitly including Stats API. Confirm the default 600 requests/key/hour budget, accounting for any other key consumers. Trial expiry is an unavailable/stale state, never zero.
5. Keep the vendor dashboard private. The custom module is the only authorized public analytics surface.

## Vercel dashboard configuration

Existing project → Settings → Environment Variables. Add the exact names below for **Production**. No environment files or provider configuration values belong in Git.

| Name | Value | Type |
| --- | --- | --- |
| `PLAUSIBLE_SCRIPT_SRC` | The exact public site-specific HTTPS URL supplied in the handoff; validated `plausible.io/js/pa-….js` path | Config |
| `PLAUSIBLE_SITE_ID` | Exact identifier confirmed in Plausible | Config |
| `PLAUSIBLE_API_KEY` | Separate team-scoped Stats API credential | Secret |
| `PLAUSIBLE_ENABLED` | `false` in this PR; only `true` after the provider hold is resolved and reviewed | Config |
| `PUBLIC_PULSE_ENABLED` | `false` while staging; `true` only when publishing the module | Config |

Do not prefix the credential with `NEXT_PUBLIC_`. Vercel's current types are Config and Secret (Secret replaces the older Sensitive label). A Secret reaches the runtime but cannot be read back from the dashboard after saving; keep its secure original.

For Preview and Development, keep both flags `false` and omit production credentials. Collection additionally requires exact `VERCEL_ENV=production` and production Node mode; local development and automated tests never collect. A separately authorized read-only preview can later use its own Stats API credential and publication flag; collection remains off there.

The data path reuses the existing durable snapshot setup: `SNAPSHOT_STORE=postgres`, `SNAPSHOT_DATABASE_URL_READ` for the restricted page reader and `SNAPSHOT_DATABASE_URL_REFRESH` for the restricted refresher. Matthew applies `db/migrations/0002_pulse_refresh_leases.sql` after 0001 through the existing database workflow. The build agent does not use a Supabase connector/CLI or apply it remotely. Without the lease table or grants, no provider refresh is attempted. File storage is for local tests only and cannot obtain production refresh leases.

## Review and activation

1. Review the PR, ADR, privacy notice variants, exact window definitions and screenshots. Confirm the full site's separate copy/release gates if that mode is selected. Preserve the current landing/full-site setting.
2. Confirm database migration and restricted-role access in a safe environment. Review source suppression against recorded synthetic responses; confirm no raw source/campaign values can appear publicly.
3. Confirm a successful authenticated Stats API response for the intended site and exact timezone. Do not report live connectivity based only on variable presence, a script fetch or the public module's unavailable state. Avoid verbose HTTP logging: never expose Authorization, API keys or upstream error bodies. `GET /api/pulse` accepts no caller-supplied parameters.
4. Publish aggregates only after the desired `PUBLIC_PULSE_ENABLED` configuration and approved source are deployed by Matthew. Environment changes affect **new deployments**, not an already-running deployment. Vercel dashboard redeployment is Matthew's action; this guide does not instruct the build agent to deploy.
5. Collection additionally requires the separate provider fix described above. To examine a newly supplied script without sending traffic: download its public URL outside the Git tree, then run `node tests/check-plausible-script.mjs /absolute/path/to/downloaded-script.js`. This substitutes fetch in an offline VM. Expected: 3 eligible pageviews, 0 private pageviews, no other event types. Expand/review this verification before clearing the hold; a passing mock is not proof of live delivery or future provider behavior.
6. After Matthew activates a fixed, approved collection integration, make a **real** visit. Confirm one initial pageview and one per eligible path navigation, no event on a same-path navigation, module rendering or poll, no query/referral detail, and no private-route event. Check blur/hidden-tab/scroll requests for engagement; any such event means stop collection. Do not generate synthetic production traffic or defeat visitor blocking.
7. Confirm the module after its cache interval: BPM's five-minute window, 24-hour history/source window, timezone, last successful timestamps and status are visible. A successful empty read is zero. Missing credentials, failure, rate limit and expired entitlement must retain a stale timestamp or say unavailable. Test pause/reduced motion, keyboard, 320 px/200% reflow and a screen reader; automated axe is not the complete WCAG review.

## Rollback and operational behavior

To stop publication, set `PUBLIC_PULSE_ENABLED=false` and have Matthew deploy that configuration. The server then renders no module, returns 404, reads no pulse cache and makes no Stats API requests. Existing visible browsers remove it at their next visible poll (within about 60 seconds); an already delivered no-JavaScript page is static until reloaded.

To stop collection, set `PLAUSIBLE_ENABLED=false` and deploy that configuration. Publication and collection are separate: stopping one does not stop the other. Already-open pages from a prior deployment can retain their loaded script until navigation/reload. For an incident, also use the provider's controls as appropriate; do not claim a deployment recalls already delivered code or data. Restoring Matthew's approved previous deployment is the alternative rollback; confirm its configuration too. Do not delete last-good snapshots as a substitute for the publication flag.

When a provider read fails, the lease prevents a request storm. Recent reads are attempted at most every 60 seconds; historical/source reads at most every 5 minutes; a Retry-After response extends the wait (capped at 24 hours). A credential/plan rejection waits at least 1 hour. Source times stay unchanged. If configuration or the site/population changes, a distinct runtime namespace prevents serving another site's or population's snapshot. No individual events are stored by this feature; only the validated public aggregate projection is persisted.
