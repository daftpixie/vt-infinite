# OneRhythm plan: activation and operation

The OneRhythm plan page (`/plan/onerhythm`) shows a read-only projection of the open plan project: initiative and step titles, done or open, due dates and milestones. Nothing else is read or stored. It ships disabled; `PLAN_ENABLED` stays unset until gate R4 clears. Design: ADR 0004.

Nothing here is automated. The owner does every step by hand. Never paste a token, secret, project ID or connection string into a chat, an issue, a pull request or this repository. This document uses placeholders: `<project-id>`, `<client-id>`, `<client-secret>`, `<refresh-token>`.

## What the site does and never does

- Reads two lists only, with GET: the project's tasks and each initiative's subtasks, every page of each. A failed page fails the whole read; the last good projection stays.
- Never writes to Asana, never reads notes, assignees, comments, attachments, tags, followers or custom fields, and never contacts Asana on a page request. The scheduled job reads at most once a minute while the plan is enabled.
- Holds back any title that trips a guard (private contact details, links, long IDs, private identifiers, the other initiative's name, handoff or ownership claims, the brand reference's words to avoid, PBC or funding language). The page says how many items are held back; the job's log names the rules, never the titles.

## Activation order (R4)

1. **Dedicated account.** Create an Asana account used only for this, with two-step verification on. Give it access to the open plan project and nothing else. Account permissions and token scopes are separate controls: the account itself may be able to do more than its token, so keep its access narrow. Signed in as that account, confirm it cannot see any private project, and that no private task is also listed in the open plan project (a task in two projects shows its title in both).
2. **Whole-project review.** Review every task and subtask in the project, including notes, before anything is published. After activation every edit to a title, state or due date in that project is a potential publication.
3. **OAuth app.** Signed in as the dedicated account, open Asana's developer console and create an app. Give it the `tasks:read` scope only; do not add webhook or write scopes. Register the redirect URI `urn:ietf:wg:oauth:2.0:oob`. If Asana does not accept it, register an `https` URL you control instead and use that URL wherever this guide says `urn:ietf:wg:oauth:2.0:oob`. Then set `ASANA_PLAN_REDIRECT_URI` to that URL in step 6.
4. **Authorize once.** In a browser signed in as the dedicated account, open
   `https://app.asana.com/-/oauth_authorize?client_id=<client-id>&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=tasks:read&state=<any-random-string>`
   Approve. Asana shows a one-time code; copy it.
5. **Exchange the code, on your own machine.** The values are read without echoing them or storing them in your shell history:
   ```
   read -rs CLIENT_SECRET; read -rs CODE
   curl -sS https://app.asana.com/-/oauth_token \
     -d grant_type=authorization_code -d client_id=<client-id> \
     --data-urlencode "client_secret=$CLIENT_SECRET" \
     -d redirect_uri=urn:ietf:wg:oauth:2.0:oob --data-urlencode "code=$CODE"
   unset CLIENT_SECRET CODE
   ```
   Copy `refresh_token` from the answer straight into Vercel (step 6). Ignore `access_token`; it expires in an hour and the site gets its own.
6. **Vercel, Production only.** Project → Settings → Environment Variables:

   | Name | Value |
   | --- | --- |
   | `ASANA_PLAN_PROJECT_ID` | the open plan project's ID (digits, from its URL) |
   | `ASANA_PLAN_CLIENT_ID` | the app's client ID |
   | `ASANA_PLAN_CLIENT_SECRET` | the app's client secret |
   | `ASANA_PLAN_REFRESH_TOKEN` | the refresh token from step 5 |
   | `PLAN_KEY_SECRET` | at least 32 random characters, for example from `openssl rand -base64 48` |
   | `ASANA_PLAN_REDIRECT_URI` | only if you registered an `https` URL in step 3 |

   Do not set any of them, or `PLAN_ENABLED`, for Preview.
7. **Choose the refresh schedule.** The cron runs every fifteen minutes, so a change in Asana reaches the site within about fifteen minutes. The PRD's target is about two minutes, which needs a per-minute schedule. If your Vercel plan allows it, ask Claude for the one-line pull request that sets `vercel.json` to `* * * * *`, and merge it before step 10.
8. **Dry run with the plan still off.** Redeploy production. In the runtime logs for `/api/cron/refresh`, the answer's `jobs.plan` reads `{"status":"ok","detail":{"result":"off"}}`. `/plan/onerhythm` answers 404.
9. **Supply the plan's description (P11), before the plan is turned on.** Matthew supplies the approved description of the plan and what it shows. A pull request replaces the `oneRhythmPlanIntro` placeholder with it on `/plan/onerhythm` (`app/plan/onerhythm/page.tsx`) and on Home (`components/HomePlan.tsx`), and removes the entry from `lib/placeholders.ts`. Merge it before step 10. Then check, on your own machine on `main`:
   ```
   PLAN_ENABLED=true node scripts/check-plan-activation.mjs
   ```
   It must end with `plan activation check: passed.` The same check runs before every build (`prebuild`): with `PLAN_ENABLED=true` in the build's environment, a build in which any placeholder would render on `/plan/onerhythm` or in Home's plan block fails, so a deploy cannot turn the plan on with a placeholder showing. With the plan off it prints `PLAN_ENABLED is not on; nothing to check.` and does nothing. Not yet confirmed on Vercel: that its build runs `prebuild` and has the dev dependencies the check uses. In step 10, the build log shows one of the two lines; if neither appears, stop and tell Claude.
10. **Turn it on.** Set `PLAN_ENABLED=true` for Production and redeploy. The build log shows `plan activation check: passed.` Then:
   - **The read worked.** The next cron run shows `jobs.plan` with `"result":"updated"`. `"unconfigured"` names a missing variable in the log; `"failed"` gives a reason such as `token: HTTP 401` (see Token refresh) or `subtasks: HTTP 403`.
   - **It matches the review.** Open `/plan/onerhythm`. Compare it with the reviewed project: every initiative in order, each step under its parent once, done and open, due dates, milestones. The page shows "Last read" with a time.
   - **Held items are intended.** If the page says items are held for review, read the job's log line (`plan: withheld … rules …`) and decide each one: edit the title in Asana, or approve the wording with an entry in `guards/exceptions.json` (target `plan:onerhythm`) through a pull request.
   - **The token is read-only.** In Asana, signed in as the dedicated account, the app's authorization lists `tasks:read` and nothing else.
   - **The unverified points hold.** These come from ADR 0004 and are checked here: the read worked with `tasks:read` alone, and the order on the page is the project's order.
11. **Test withdrawal.** Withdraw (below), then confirm that within a minute `/plan/onerhythm` answers 404 and Home shows the placeholder, with no redeploy. Then restore.

## Operator switches

Run these in the Supabase **SQL Editor**, as `postgres`. Each touches only the plan's control record. Readers apply it on their next request, with no redeploy and no Asana read.

**Withdraw the plan from every surface:**
```
insert into site.public_snapshots (key, schema_version, fetched_at, data)
values ('plan-control:onerhythm', 1, now(), '{"withdrawn": true}')
on conflict (key) do update set data = excluded.data, fetched_at = now(), updated_at = now();
```
While withdrawn, the page and `/api/plan/onerhythm` answer 404, Home shows the placeholder, open pages reload away from the plan on their next poll, and the job stops reading Asana.

**Restore:** run the same statement with `'{}'` in place of `'{"withdrawn": true}'`.

**An empty read.** If a successful read has nothing to show (an empty project, or every item held back), the plan is held: the page says so and shows neither the empty plan nor the earlier one. A later read with something to show clears the hold by itself. To publish the empty plan instead, run the statement with `'{"publishEmpty": true}'`. Set it back to `'{}'` afterwards, or later empty reads will also publish.

**Turn it off entirely:** remove `PLAN_ENABLED` from Production and redeploy.

On the file store (previews and local work), the control record is the file `plan-control__onerhythm.json` in `SNAPSHOT_DIR`, holding `{"schemaVersion":1,"fetchedAt":"<ISO time>","data":{"withdrawn":true}}`.

## Token refresh

The server exchanges `ASANA_PLAN_REFRESH_TOKEN` for an access token about once an hour and keeps it in memory only. Nobody needs to refresh anything by hand while the grant stands.

- **A 401 from the API.** The server forgets its cached access token, so the next read (after the usual backoff) exchanges the refresh token again rather than reusing a refused token until it expires. If that exchange also fails, see the next item.
- **The grant stops working.** This happens if someone revokes the app, changes the dedicated account's password or removes its access. The job then reports `"result":"failed"` with `token: HTTP 400` or `token: HTTP 401`. The page keeps the last good read, labeled stale after 30 minutes. To recover, repeat steps 4 to 6 and redeploy.
- **Rotating the client secret.** Regenerate it in the developer console, update `ASANA_PLAN_CLIENT_SECRET`, and redeploy.
- **A new refresh token.** If Asana ever returns a new refresh token, the log says "Asana returned a different refresh token". Repeat steps 4 to 6.
- **Revoking access entirely.** Withdraw the plan, then remove the app's authorization from the dedicated account in Asana.

## Public keys

Each item on the page carries a random public key, never the provider's ID. The server keeps a private index from a keyed digest of each provider ID (HMAC-SHA-256 with `PLAN_KEY_SECRET`) to the key it issued, so keys stay the same from read to read.

- **Keys survive a gap.** The index keeps every key it has issued, not only those in the latest read, so an item that is held back or briefly missing gets its old key when it returns.
- **Bounded growth.** The index holds every item in the current read plus the most recently seen others, up to 5,000 entries in all. An item gets a new key only if it was absent while 5,000 others were seen more recently.
- **Rotating `PLAN_KEY_SECRET` re-keys every item.** Every digest changes, so no item finds its old key: every key in the plan API's answer changes at the next read, and anything that kept an old key no longer matches. (Keys are not shown on the page; they appear only in that answer.) The job logs `PLAN_KEY_SECRET changed; every item gets a new public key` and drops the old entries. Rotate it only if it may have leaked; to rotate, replace the value in Vercel (Production) and redeploy.

## Not automated, and not yet built

- Webhooks (A-9): later, with their own scopes and signature checks.
- An admin switch for withdrawal: until the admin stage, use the SQL above.
