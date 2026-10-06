# ADR 0003: Postgres snapshots and a scheduled refresh

- Status: proposed (stage 2d pull request)
- Date: 2026-10-06
- Decider: Matthew J Adams

## Context

ADR 0002 added a snapshot store with a file adapter and an unwired Postgres adapter, and refreshed upstream sources after page responses. On serverless hosting the file store does not persist, and refreshing from page views ties provider traffic to readers (PRD SS-2, SS-5). Matthew created a Supabase project for the site on 6 Oct 2026.

## Decision

- **Driver:** `postgres` (postgres.js) 3.4.9, pinned, server-only. Supabase's documented setting for postgres.js in transaction mode is `prepare: false`.
- **Connection:** Supabase's shared pooler in **transaction mode** (port 6543), which Supabase recommends for serverless functions; one connection per function instance, idle connections closed after 20 s, TLS required. Sources: https://supabase.com/docs/guides/database/connecting-to-postgres, https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
- **Schema and roles:** table `site.public_snapshots` in schema `site`, not exposed to the Data API; row level security on; all privileges revoked from `public`, `anon` and `authenticated`. Two roles created without login: `site_reader` (select) for page reads and `site_refresher` (select, insert, update; no delete) for the job. The owner gives them login and passwords by hand (`docs/ops/database.md`). Migration `0001` had never been applied, so it was amended in place rather than followed by a second migration.
- **Configuration:** `SNAPSHOT_STORE=postgres` with `SNAPSHOT_DATABASE_URL_READ` and `SNAPSHOT_DATABASE_URL_REFRESH`, Production only. A missing URL fails at server start (`instrumentation.ts`). Previews and local work keep the file store.
- **Failures are visible:** a failed write is logged with the key and the error class (never the message, which could carry a value) and rethrown; a failed read is logged and shown as "unavailable".
- **Refresh off the request path:** pages only read snapshots. `/api/cron/refresh` runs every fifteen minutes from Vercel Cron (`vercel.json`), accepts only `Authorization: Bearer <CRON_SECRET>` compared in constant time, and answers 404 to anything else. Feeds keep their fifteen-minute floor and backoff inside the job; repositories refresh at most hourly. `UPSTREAM_REFRESH=off` disables the job. Locally, `npm run refresh` calls the same route on a running server. Source for the cron authorization pattern: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- **Code page (D6, Matthew's answer of 6 Oct 2026):** GitHub is asked with conditional requests (ETag), so an unchanged repository answers 304, which GitHub does not count against the unauthenticated rate limit. A 404 or a private repository hides the entry at once. A redirect (renamed or transferred repository), or an answer naming a different repository, hides the entry and is reported in the job's log for review. On a GitHub outage an earlier confirmation is kept and labeled with its date; an entry never confirmed stays hidden.

## Not verified

- **Cron and Deployment Protection.** The Vercel documentation available to the build session did not say whether scheduled cron invocations reach a production deployment protected by Vercel Authentication. `docs/ops/database.md` step 6 checks it on the first run. If they are blocked, the options (a protection exception, or a different trigger) are Matthew's decision.
- **Plan limits.** Whether the Vercel plan permits a fifteen-minute schedule was not confirmed; see the same document, step 5.
