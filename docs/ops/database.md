# Snapshot database: setup and verification

Production keeps the last good read of each publication feed and of the Code page's GitHub checks in Postgres (Supabase), so a deployment or cold start never erases it. Previews and local work keep the file store. Nothing here is automated: the owner runs every step by hand.

Never paste a password, connection string or project reference into a chat, an issue, a pull request or this repository. This document uses placeholders: `<project-ref>`, `<region>`, `<reader-password>`, `<refresher-password>`.

## Activation order

Follow these in order. Each step has its own section below.

1. Apply the migration, then run the database checks ([1](#1-apply-the-migration), [2](#2-check-the-database)).
2. Give both roles a login and a password ([3](#3-give-the-two-roles-a-login-and-a-password)), and build their connection strings ([4](#4-build-the-two-connection-strings)).
3. In Vercel, add `CRON_SECRET`, `SNAPSHOT_STORE=postgres`, `SNAPSHOT_DATABASE_URL_READ` and `SNAPSHOT_DATABASE_URL_REFRESH` to **Production only** ([5](#5-vercel-environment-variables-production-only)).
4. Remove `UPSTREAM_REFRESH` from **Production only**. Preview keeps it set to `off`.
5. Redeploy production ([6](#6-redeploy)).
6. Run the post-deploy checks ([7](#7-post-deploy-checks)).

If any check fails, stop and report it before changing anything else. [Roll back](#roll-back) if production misbehaves.

## Two ways to run SQL

**Supabase SQL Editor (use this unless a step says otherwise).** Supabase project → **SQL Editor** → **New query**. It runs as `postgres` and needs nothing installed.

**psql (alternative).** Use the **Session pooler** string from **Connect**: the pooler host, port **5432**, user `postgres.<project-ref>`, database `postgres`. Do not use the direct host (`db.<project-ref>.supabase.co`) unless the project has the IPv4 add-on: the direct host is IPv6-only, and many networks cannot reach it. Do not use the transaction pooler (port 6543) for these steps; it is for the site's own connections.

Source: https://supabase.com/docs/guides/database/connecting-to-postgres

## 1. Apply the migration

1. In the SQL Editor, open a new query.
2. Paste the whole of `db/migrations/0001_public_snapshots.sql` from `main` and run it once. It is safe to re-run: every statement checks before it creates, and the revokes and grants give the same result each time.
3. It creates schema `site`, table `site.public_snapshots` with row level security on, and two roles without login (`site_reader`, `site_refresher`) with their grants and policies. It revokes everything on the schema and table from `public`, `anon`, `authenticated` and `service_role`. `service_role` bypasses row level security, so it gets no access to this schema at all.

Do not add `site` to the Data API's exposed schemas (Project Settings → API). The site never uses the Data API for this table.

## 2. Check the database

Run both queries in the SQL Editor.

**No Supabase API role has any privilege on schema `site` or its table.** Every value must be `false`:

```
select r as role,
       has_schema_privilege(r, 'site', 'usage') as schema_usage,
       has_schema_privilege(r, 'site', 'create') as schema_create,
       has_table_privilege(r, 'site.public_snapshots', 'select, insert, update, delete, truncate, references, trigger') as table_any
from unnest(array['anon', 'authenticated', 'service_role']) as r;
```

**Nothing would grant them access automatically later.** Default privileges apply to objects created in future; this lists those that cover every schema or `site`:

```
select pg_get_userbyid(d.defaclrole) as grantor,
       coalesce(n.nspname, '(every schema)') as applies_to,
       d.defaclobjtype as object_type,
       d.defaclacl as privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclnamespace = 0 or n.nspname = 'site';
```

No row may name `anon`, `authenticated` or `service_role` in `privileges`. An empty result is correct. Rows that cover only `public` or other schemas are not listed and do not matter here. If a listed row names one of those roles, stop and report it: the existing table is still closed (the first query proves that), but a table added to `site` later would be opened.

**The site's roles are narrow.** All three must be `false`:

```
select has_table_privilege('site_reader', 'site.public_snapshots', 'insert') as reader_can_insert,
       has_table_privilege('site_refresher', 'site.public_snapshots', 'delete') as refresher_can_delete,
       has_table_privilege('anon', 'site.public_snapshots', 'select') as anon_can_select;
```

## 3. Give the two roles a login and a password

Generate two long random passwords in your password manager. Type them yourself; never share them.

**Preferred, where you can run psql: `\password`.** Connect through the session pooler as above, then run

```
alter role site_reader login;
alter role site_refresher login;
\password site_reader
\password site_refresher
```

`\password` prompts without echoing and sends only a hash, so the password never exists as query text.

**SQL Editor, if psql is not available.** Run `alter role site_reader with login password '<reader-password>';` and the same for `site_refresher`. The statement text, including the password, may be kept in more than one place: the editor's history and saved snippets, and also the database's statement logs, if statement logging captures it. Delete the queries from the editor's history and snippets afterwards. The logs cannot be edited, so prefer `\password` where you can; a password that may have been logged can be retired later by setting a new one with `\password`.

## 4. Build the two connection strings

Use the **Transaction pooler** string from **Connect** (shared pooler, port **6543**). Supabase recommends transaction mode for serverless functions; the site's driver (postgres.js) runs with prepared statements off, as transaction mode requires.

Copy that string twice and change only its user and password parts:

- Reader: user `site_reader.<project-ref>`, password `<reader-password>`.
- Refresher: user `site_refresher.<project-ref>`, password `<refresher-password>`.

Keep the pooler host, port 6543 and database `postgres` exactly as Supabase shows them. Paste the results straight into Vercel (step 5); never save them in a file, ticket or chat. Percent-encode any special characters in the password.

Sources: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL

## 5. Vercel environment variables (Production only)

Project → Settings → Environment Variables. Add these to **Production** only. Leave Preview and Development on the file store.

| Name | Value |
| --- | --- |
| `CRON_SECRET` | a random string of at least 32 characters; Vercel sends it to the cron route as a bearer token |
| `SNAPSHOT_STORE` | `postgres` |
| `SNAPSHOT_DATABASE_URL_READ` | the reader string from step 4 |
| `SNAPSHOT_DATABASE_URL_REFRESH` | the refresher string from step 4 |

Then remove `UPSTREAM_REFRESH` from **Production** only: the refresh job does nothing while it is `off`. Keep it `off` for **Preview**, so previews never contact Substack or GitHub.

If `SNAPSHOT_STORE=postgres` is set without both URLs, the server refuses to start and names the missing variable.

## 6. Redeploy

Redeploy production after the variables are saved. Cron jobs run only on the production deployment, on the schedule in `vercel.json` (every fifteen minutes).

Before this, confirm that your Vercel plan allows a fifteen-minute cron schedule. If it does not, the deployment may be rejected; tell Claude and the schedule will be changed in a pull request.

## 7. Post-deploy checks

1. **The job is listed.** Vercel → Project → Settings → **Cron Jobs** lists `/api/cron/refresh` with the schedule `*/15 * * * *`.
2. **The route answers 200 within fifteen minutes.** Vercel → Project → **Logs**, filtered to the path `/api/cron/refresh`. Within fifteen minutes of the deployment there is a request with status `200`. You can also start a run with **Run** on the Cron Jobs page. The route answers with each job's status, for example

   ```
   {"ok":true,"jobs":{"streams":{"status":"ok","detail":{"publications":{"the-human-butterfly":"updated"}}},"repos":{"status":"ok","detail":{"skipped":false,"moved":0,"notPublic":0,"unavailable":0}}}}
   ```

   A job showing `"status":"error"` failed on its own (its log line names the job and the error class) while the others still ran; report it. A `404` means `CRON_SECRET` is missing or differs.
3. **Deployment Protection is not blocking cron.** If the log shows the cron request answered by Vercel's authentication page, a redirect to it, or a `401` or `403`, rather than the route's JSON, Deployment Protection is blocking the job. Stop and report it. Do not weaken or turn off protection, and do not add a bypass; that decision comes back to Matthew.
4. **Home shows a snapshot time.** Open `/` on production (signed in through Vercel Authentication). Under "Latest words", each enabled publication shows "last read" with a date and time, not "Publication feed unavailable".
5. **Rows exist.** In the SQL Editor: `select key, fetched_at, updated_at from site.public_snapshots order by key;` lists a row per enabled publication, plus `code-repos` and the publications' `stream-meta:` rows.

## Roll back

Remove `SNAPSHOT_STORE` from Production (or set it to `file`) and redeploy. Pages then read the ephemeral file store and show "Publication feed unavailable" until a refresh succeeds on that instance. The table and roles can stay.
