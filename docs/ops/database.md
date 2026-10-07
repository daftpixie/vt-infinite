# Snapshot database: setup and verification

Production keeps the last good read of each publication feed and of the Code page's GitHub checks in Postgres (Supabase), so a deployment or cold start never erases it. Previews and local work keep the file store. Nothing here is automated: the owner runs every step below by hand.

Never paste a password, connection string or project reference into a chat, an issue, a pull request or this repository. This document uses placeholders: `<project-ref>`, `<region>`, `<reader-password>`, `<refresher-password>`.

## 1. Apply the migration

1. Open the Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of `db/migrations/0001_public_snapshots.sql` from `main` and run it once. It is safe to re-run: every statement checks before it creates.
3. It creates schema `site`, table `site.public_snapshots` with row level security on, two roles without login (`site_reader`, `site_refresher`), their grants and policies, and revokes everything from `public`, `anon` and `authenticated`.

Do not add `site` to the Data API's exposed schemas (Project Settings → API). The site never uses the Data API for this table.

## 2. Give the two roles a login and a password

Generate two long random passwords in your password manager. Type them yourself; never share them.

Preferred, because the password is never stored as query text: connect with `psql` using the **direct** connection string from **Connect**, as `postgres`, then run

```
alter role site_reader login;
alter role site_refresher login;
\password site_reader
\password site_refresher
```

`\password` prompts without echoing and sends only a hash.

If you use the SQL Editor instead, run `alter role site_reader with login password '<reader-password>';` and the same for `site_refresher`, then delete those queries from the editor's history and saved snippets.

## 3. Build the two connection strings

Use the **Transaction pooler** string from **Connect** (shared pooler, port **6543**). Supabase recommends transaction mode for serverless functions; the site's driver (postgres.js) runs with prepared statements off, as transaction mode requires.

Copy that string twice and change only its user and password parts:

- Reader: user `site_reader.<project-ref>`, password `<reader-password>`.
- Refresher: user `site_refresher.<project-ref>`, password `<refresher-password>`.

Keep the pooler host, port 6543 and database `postgres` exactly as Supabase shows them. Paste the results straight into Vercel (step 4); never save them in a file, ticket or chat. Percent-encode any special characters in the password.

Sources: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL

## 4. Vercel environment variables (Production only)

Project → Settings → Environment Variables. Add these to **Production** only. Leave Preview and Development on the file store.

| Name | Value |
| --- | --- |
| `SNAPSHOT_STORE` | `postgres` |
| `SNAPSHOT_DATABASE_URL_READ` | the reader string from step 3 |
| `SNAPSHOT_DATABASE_URL_REFRESH` | the refresher string from step 3 |
| `CRON_SECRET` | a random string of at least 32 characters; Vercel sends it to the cron route as a bearer token |

Also check `UPSTREAM_REFRESH` for Production: the refresh job does nothing while it is `off`. Remove it from Production, or set it to anything other than `off`, when you want feeds read. Keep it `off` for Preview.

If `SNAPSHOT_STORE=postgres` is set without both URLs, the server refuses to start and names the missing variable.

## 5. Deploy

Redeploy production after the variables are saved. Cron jobs run only on the production deployment, on the schedule in `vercel.json` (every fifteen minutes).

Before merging, confirm that your Vercel plan allows a fifteen-minute cron schedule. If it does not, the deployment may be rejected; tell Claude and the schedule will be changed in a pull request.

## 6. Verify

1. **Cron reaches the route.** Vercel → Project → Settings → Cron Jobs → run `/api/cron/refresh`, then read its log. A healthy run answers `200` with JSON such as `{"ok":true,"streams":{"the-human-butterfly":"updated"},...}`. A `404` means `CRON_SECRET` is missing or differs. If the log shows a Vercel Authentication page or a redirect instead of the route's JSON, Deployment Protection is blocking the job; report it before changing any protection setting.
2. **Rows exist.** In the SQL Editor: `select key, fetched_at, updated_at from site.public_snapshots order by key;`
3. **Privileges are narrow.** In the SQL Editor:
   ```
   select has_table_privilege('site_reader', 'site.public_snapshots', 'insert') as reader_can_insert,
          has_table_privilege('site_refresher', 'site.public_snapshots', 'delete') as refresher_can_delete,
          has_table_privilege('anon', 'site.public_snapshots', 'select') as anon_can_select;
   ```
   All three must be `false`.
4. **Pages read the database.** Open `/words` on production (signed in through Vercel Authentication). The feed status is no longer "Publication feed unavailable" once a refresh has succeeded.

## Roll back

Remove `SNAPSHOT_STORE` from Production (or set it to `file`) and redeploy. Pages then read the ephemeral file store and show "Publication feed unavailable" until a refresh succeeds on that instance. The table and roles can stay.
