# The Signal operator checklist

Matthew owns SQL application, secrets, hosted configuration and production release. This PR does not merge or activate the feature. Keep `SITE_MODE` unchanged and **both hosted flags false while staging**.

## Already confirmed

Matthew confirms the five Plausible variables are present in Vercel, the configured site identifier and `America/New_York` reporting timezone have been checked, and both flags remain false. Do not recreate credentials or repeat those checks. Vercel values are not automatically available in the build environment.

The final collector uses Plausible’s documented **Events API directly from the browser**, with sanitized public pageviews only. The supplied tracking script’s bypassed engagement path could measure activity in a private route after a History replace. Aggregate engagement is permitted by the product policy when verified safe; this implementation chooses a smaller pageview-only transport. It does not load, patch or proxy the vendor script and does not capture outbound links, downloads, forms, scroll or time engaged. The old vendor-change hold is removed; essential hosted runtime verification is still pending.

## 1. Database — separate from Vercel variables

In the existing VT Infinite project’s Supabase **SQL Editor**, run this read-only preflight:

```sql
select to_regclass('site.public_snapshots') as public_snapshots,
       to_regclass('site.pulse_refresh_leases') as pulse_refresh_leases;
```

| Result | Owner action |
| --- | --- |
| Both tables exist | Verify permissions; existence alone is insufficient |
| Snapshots exists, leases absent | Run 0002 |
| Both absent | Run 0001, then 0002; finish restricted-role login/connection setup |
| Leases exists without snapshots, or query errors | Resolve the inconsistent setup before unrelated changes |

Copy and run the **entire** required SQL file from the reviewed PR version, in this order. These migrations are unchanged from reviewed head `50a81a7`:

1. [0001_public_snapshots.sql](https://github.com/daftpixie/vt-infinite/blob/50a81a762332ee57171767339ae8c1aff094c95f/db/migrations/0001_public_snapshots.sql), only if the base setup is absent.
2. [0002_pulse_refresh_leases.sql](https://github.com/daftpixie/vt-infinite/blob/50a81a762332ee57171767339ae8c1aff094c95f/db/migrations/0002_pulse_refresh_leases.sql), installing the lease table, RLS and restricted grants/policy. It replaces its named policy, not tables or data.

For a new base setup, 0001 creates `site_reader` and `site_refresher` without LOGIN/passwords. Follow only the existing [role-login](database.md#3-give-the-two-roles-a-login-and-a-password) and [transaction-pooler connection-string](database.md#4-build-the-two-connection-strings) sections yourself. Correct existing roles do not need new passwords merely for 0002. Keep the `site` schema outside the Data API; retain the existing schema/API-role/default-privilege checks in the database guide. No additional upstream job/cron setup is part of The Signal.

Rerun the table check, then:

```sql
select
  has_table_privilege('site_reader', 'site.public_snapshots', 'select') as reader_snapshots,
  has_table_privilege('site_reader', 'site.pulse_refresh_leases', 'select') as reader_leases,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'select') as refresher_select,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'insert') as refresher_insert,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'update') as refresher_update;
```

Expected in order: **true, false, true, true, true**. Both restricted roles need LOGIN for runtime connections. Neither API keys nor table existence establish that the connections/permissions work. Remote SQL and writes remain Matthew’s actions; the build agent applies migrations only to its disposable local test database.

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

This build environment has no authorized Stats API credential or restricted database connection bindings. Therefore live authenticated reads, latency and hosted table/role readiness remain unverified; Matthew’s site/timezone/configuration confirmations remain accepted.

Where existing authorized bindings are available, run:

```sh
node scripts/signal-preflight.mjs
```

This explicit operator probe makes one fixed read-only Stats API v2 `pageviews` query, reports only HTTP/result validity and elapsed milliseconds, and checks tables, expected role identity/LOGIN, required grants and RLS using read-only database transactions. It writes no remote rows or leases, installs nothing and changes no setting. Exit 0 means those checks passed; exit 2 means a missing or unresolved prerequisite. It does not prove Data API exposure/default privileges, live collection delivery or human accessibility; use the guide’s existing checks for those. It prints no key, URL/connection value, Authorization header, metric value or raw upstream error. Never paste credentials to enable it.

Normal shared API demand remains **360 requests/key/hour**: 60 recent reads plus 25 historical/source queries every 5 minutes, with concurrency 4 for the historical batch. The documented default limit is 600/key/hour; a manual probe and other consumers share that budget. Live latency cannot be inferred from mocked tests and must be recorded from an authenticated read. Confirm continuing Stats API entitlement at trial renewal; current plans include it in Business.

In Plausible **site settings → General → Tracking**, keep optional outbound links, downloads and form submissions disabled. The selected collector installs none of those event producers; account settings still matter for any future script installation. Use the separate **Stats API** key from account settings → API Keys, rather than the public installation identifier. The trial includes Business features; an ongoing plan must include Stats API access.

For offline transport evidence without sending synthetic traffic:

```sh
node tests/check-plausible-script.mjs
```

Expected: only `pageview`, field names `domain/name/referrer/url`, 7 expected navigation/restoration events, privacy contract pass. To inspect a separately downloaded public vendor script without executing network requests, add its local file path. The supplied v37 comparison fails the private replace/scroll/blur scenario; the shipped collector does not use it. No provider configuration belongs in Git.

## 4. Review, activation and rollback

Review the final PR, conditional notices and labeled synthetic screenshots. Native count/method disclosures must be closed initially in both variants; verify keyboard, 320 px/200% reflow, pause/reduced motion and a human screen-reader review. Automated tests/axe do not complete WCAG review. Essential hosted runtime verification must finish before marking the PR ready; passing local/CI checks alone does not clear it.

After the approved source, SQL/connections and live read checks are ready, **Matthew** chooses collection/publication flags independently and deploys that configuration. Do not merge, weaken Deployment Protection or change access to test it. Optional outbound/download/form capture stays disabled. The public vendor dashboard is outside this feature.

After Matthew activates collection, verify a real visit and eligible path navigation appear once; same-path query/fragment changes, scroll, blur, hidden tabs, private routes, module rendering and polling must add no event. Queries/fragments and referral paths/campaigns must be absent. Inspect direct requests without exposing their full payloads or credentials; no synthetic production traffic or blocking bypass. Then verify the aggregate module after its cache interval, with separate recent/history windows, original successful timestamps, source suppression and honest status.

To roll back, Matthew sets the relevant flag false and deploys that configuration, or restores the approved prior deployment with its configuration. `PUBLIC_PULSE_ENABLED=false` removes server publication/cache reads/upstream refresh and returns 404; visible clients remove the module at their next poll, about 60 seconds. `PLAUSIBLE_ENABLED=false` stops collection in newly loaded pages; already-open pages can retain delivered code until reload/navigation. Disabling display does not itself stop collection, and vice versa. Do not delete last-good snapshots as rollback. No-JavaScript pages remain static until reloaded.

Current documentation rechecked for this follow-up: [Events API](https://plausible.io/docs/events-api), [script options](https://plausible.io/docs/script-extensions), [Stats API and limits](https://plausible.io/docs/stats-api), [plans/trial](https://plausible.io/docs/subscription-plans), [Vercel Config/Secret](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types) and [environment changes/new deployments](https://vercel.com/docs/environment-variables/managing-environment-variables).
