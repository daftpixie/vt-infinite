# The Signal operator checklist

Matthew owns SQL application, secrets, hosted configuration and production release. This PR does not merge or activate the feature. Keep `SITE_MODE` unchanged and **both hosted flags false while staging**.

## Already confirmed

Matthew confirms the five Plausible variables are present in Vercel, the configured site identifier and `America/New_York` reporting timezone have been checked, and both flags remain false. Do not recreate credentials or repeat those checks. Vercel values are not automatically available in the build environment.

Matthew’s SQL result confirms **both `site.public_snapshots` and `site.pulse_refresh_leases` exist**. He also confirms the visual, screen-reader/accessibility and device-review item from the latest handoff. These are owner-confirmed findings, not checks personally repeated by the build session. He acknowledges the continuing Stats API requirement after the trial; this does not establish a particular paid subscription or an authenticated API result.

The final collector uses Plausible’s documented **Events API directly from the browser**, with sanitized public pageviews only. The supplied tracking script’s bypassed engagement path could measure activity in a private route after a History replace. Aggregate engagement is permitted by the product policy when verified safe; this implementation chooses a smaller pageview-only transport. It does not load, patch or proxy the vendor script and does not capture outbound links, downloads, forms, scroll or time engaged. The old vendor-change hold is removed; essential hosted runtime verification is still pending.

## 1. Existing database — verify the restricted connections

Table existence is confirmed; **do not rerun 0001 or 0002 on that basis**. The unchanged migration history is [0001_public_snapshots.sql](../../db/migrations/0001_public_snapshots.sql), then [0002_pulse_refresh_leases.sql](../../db/migrations/0002_pulse_refresh_leases.sql). No missing hosted object or incorrect permission has been demonstrated, so no repair SQL is proposed.

Existing correct role logins, passwords and connections should be retained. The [role-login](database.md#3-give-the-two-roles-a-login-and-a-password) and [transaction-pooler connection-string](database.md#4-build-the-two-connection-strings) sections document their contract; they are not instructions to recreate them. Both connections must authenticate as their intended restricted roles. An administrative SQL Editor session cannot prove that either runtime connection works.

The corrected Node preflight below checks the effective grant contract with **read-only catalog SELECTs**, including column grants in the reader’s prohibitions:

| Findings | Expected booleans |
| --- | --- |
| `schema_exists`, `snapshots`, `leases` | All true |
| `role_matches`, `login_enabled`, `schema_usage` for each connection | All true |
| `reader_snapshots_select` | True |
| `refresher_snapshots_select`, `refresher_snapshots_insert`, `refresher_snapshots_update` | All true; all three are required |
| `refresher_leases_select`, `refresher_leases_insert`, `refresher_leases_update` | All true |
| `snapshots_rls`, `leases_rls` | Both true: RLS is enabled |
| `reader_snapshots_write` | False: no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants |
| `reader_leases_access` | False: no table or column privileges |
| `refresher_snapshots_delete`, `refresher_leases_delete` | Both false |

Missing required grants, prohibited grants, missing schema USAGE or unexpected role identity make the result not-ready. A ready catalog result **does not prove a write will pass the applicable RLS policies**, nor hosted snapshot refresh or deployment-wide cache behavior. The probe performs no insert, update, delete, lease claim or write-and-rollback test. Actual policy/write tests run only against disposable local Postgres.

Keep the `site` schema outside the Data API and retain the existing schema/API-role/default-privilege checks in the database guide. Do not repeat unrelated cron/upstream setup. If a specific check fails, prepare the smallest repair for Matthew’s review rather than reapplying migrations or changing hosted permissions automatically.

## 2. Runtime variable contract

Keep existing correct values; do not replace secrets unnecessarily. Set no credentials in source, PR text or environment files.

| Variable | Purpose | Vercel type |
| --- | --- | --- |
| `PLAUSIBLE_SCRIPT_SRC` | Existing supplied public installation reference; not loaded by the Events API collector | Config |
| `PLAUSIBLE_SITE_ID` | Already confirmed exact site selector; intentionally public as the collection event’s domain, never a credential | Config |
| `PLAUSIBLE_API_KEY` | Existing secret Stats API credential; never sent to the browser | Secret |
| `PLAUSIBLE_ENABLED` | Collection; keep `false` while staging | Config |
| `PUBLIC_PULSE_ENABLED` | Aggregate publication; keep `false` while staging | Config |
| `SNAPSHOT_STORE` | `postgres` for durable shared production snapshots | Config |
| `SNAPSHOT_DATABASE_URL_READ` | Restricted `site_reader` transaction-pooler connection | Secret |
| `SNAPSHOT_DATABASE_URL_REFRESH` | Restricted `site_refresher` transaction-pooler connection | Secret |

Both connections must use the same project and the transaction pooler described in the guide. Supabase publishable/anon/service-role API keys are not connection strings. Do not prefix secret variables with `NEXT_PUBLIC_`. Vercel’s types are Config and Secret; Secret cannot be read back after saving.

For Preview/Development keep both flags false and omit production credentials. Collection additionally requires exact `VERCEL_ENV=production`, production Node mode and no automated-test marker. It excludes localhost, automation, opt-out, DNT/GPC and private routes, and never retries or routes around blocking. A separately authorized read-only preview can use its own Stats credential with collection off. No environment value was changed by this build session.

Applying SQL creates database objects. Adding Vercel variables configures the website; it creates no table. Vercel changes affect **new deployments**, so saving values alone does not activate them on an already-running deployment. Matthew controls any new approved deployment and retains the chosen site mode.

## 3. Remaining read-only verification

This session has no authorized bindings for `PLAUSIBLE_SITE_ID`, `PLAUSIBLE_API_KEY`, `SNAPSHOT_STORE`, `SNAPSHOT_DATABASE_URL_READ` or `SNAPSHOT_DATABASE_URL_REFRESH`. These are session prerequisites, not a claim that the saved Vercel values are missing. Authenticated API results/latency and restricted-role connection/grant checks remain pending; table existence and the other owner confirmations remain accepted.

In the project terminal with Node 24 and existing authorized bindings, run this **Node command, not SQL for Supabase’s SQL Editor**:

```sh
node scripts/signal-preflight.mjs
```

Expected success: **exit 0**, `ready: true`, `storageConfigured: true`, Stats `status: valid` with a successful HTTP status and measured `latencyMs`, and both role entries `status: ready` with the boolean contract above. A successful empty aggregate is valid; no metric values are printed. Any missing binding or failed prerequisite gives **exit 2 / `ready: false`**. Missing/failed data is not converted to zero. The probe makes one bounded authenticated Stats API v2 read and fixed catalog SELECTs over the two intended restricted connections. Never substitute an administrative connection to make it pass.

This checks API result validity and read-only connection/catalog findings only. It does not prove Data API exposure/default privileges, hosted RLS write success, browser event delivery, snapshot refresh or deployment-wide caching. It installs nothing, changes no setting and emits no key, connection value, Authorization header, metric value, raw error or upstream payload. Use existing secure bindings without exporting Vercel secrets into this session or pasting credentials into chat/files.

Normal shared API demand remains **360 requests/key/hour**: 60 recent reads plus 25 historical/source queries every 5 minutes, with concurrency 4 for the historical batch. The documented default limit is 600/key/hour; a manual probe and other consumers share that budget. Live latency cannot be inferred from mocked tests and must be recorded from an authenticated read. Matthew acknowledges the ongoing Stats API requirement; actual entitlement follows the account’s subscription, not that acknowledgement.

In Plausible **site settings → General → Tracking**, keep optional outbound links, downloads and form submissions disabled. The selected collector installs none of those event producers; account settings still matter for any future script installation. Use the separate **Stats API** key from account settings → API Keys, rather than the public installation identifier. The trial includes Business features; an ongoing plan must include Stats API access.

For offline transport evidence without sending synthetic traffic:

```sh
node tests/check-plausible-script.mjs
```

Expected: only `pageview`, field names `domain/name/referrer/url`, 7 expected navigation/restoration events, privacy contract pass. To inspect a separately downloaded public vendor script without executing network requests, add its local file path. The supplied v37 comparison fails the private replace/scroll/blur scenario; the shipped collector does not use it. No provider configuration belongs in Git.

## 4. Review, activation and rollback

Matthew has confirmed the latest handoff’s visual, screen-reader/accessibility and device review. This session preserves that completed design and records the confirmation separately from its automated checks. Review the final preflight fix and current release evidence. The PR remains draft as instructed; passing local/CI checks does not establish authenticated hosted results or authorize activation.

After approving the source and reviewing the remaining restricted-connection/API checks, **Matthew** chooses collection/publication flags independently and controls the production release. Existing confirmed tables do not need migration reruns. Do not merge, weaken Deployment Protection or change access to test it. Optional outbound/download/form capture stays disabled. The public vendor dashboard is outside this feature.

After Matthew activates collection, verify a real visit and eligible path navigation appear once; same-path query/fragment changes, scroll, blur, hidden tabs, private routes, module rendering and polling must add no event. Queries/fragments and referral paths/campaigns must be absent. Inspect direct requests without exposing their full payloads or credentials; no synthetic production traffic or blocking bypass. Then verify the aggregate module after its cache interval, with separate recent/history windows, original successful timestamps, source suppression and honest status.

To roll back, Matthew sets the relevant flag false and deploys that configuration, or restores the approved prior deployment with its configuration. `PUBLIC_PULSE_ENABLED=false` removes server publication/cache reads/upstream refresh and returns 404; visible clients remove the module at their next poll, about 60 seconds. `PLAUSIBLE_ENABLED=false` stops collection in newly loaded pages; already-open pages can retain delivered code until reload/navigation. Disabling display does not itself stop collection, and vice versa. Do not delete last-good snapshots as rollback. No-JavaScript pages remain static until reloaded.

Current documentation rechecked for this follow-up: [Events API](https://plausible.io/docs/events-api), [script options](https://plausible.io/docs/script-extensions), [Stats API and limits](https://plausible.io/docs/stats-api), [plans/trial](https://plausible.io/docs/subscription-plans), [Vercel Config/Secret](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types) and [environment changes/new deployments](https://vercel.com/docs/environment-variables/managing-environment-variables).
