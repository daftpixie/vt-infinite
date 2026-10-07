# ADR 0004: OneRhythm plan projection

- Status: proposed (stage 3 pull request)
- Date: 2026-10-07
- Decider: Matthew J Adams

## Context

The PRD (A-1 to A-10, R4) asks for a read-only public projection of the open OneRhythm plan, read from Asana with least privilege, persisted like the other snapshots, refreshed off the request path, and removable at once. It ships disabled: `PLAN_ENABLED` stays off until R4 clears.

## Decision

- **Read client** (`lib/plan/asana.ts`): GET only, on two allowlisted endpoints (`/projects/{id}/tasks`, `/tasks/{id}/subtasks`), with `opt_fields` limited to `name,completed,due_on,resource_subtype` (plus `parent` on the project list), `limit=100`, and every page followed through `next_page.offset`. There is no method parameter; `assertAllowed` refuses any other method or path before a request is built. Any failed page or subtask read, an unexpected response shape, a repeated offset or more than 50 pages fails the whole read, and the last good projection stays. Redirects are refused; responses are capped at 2 MB with a 10 s timeout.
- **Credential** (`lib/plan/oauth.ts`): a dedicated Asana account authorizes an OAuth app once, with the `tasks:read` scope, outside the site (`docs/ops/plan.md`). The server holds only the refresh token, in the host's environment, and exchanges it for one-hour access tokens kept in memory. That exchange is the only non-GET request in the plan code and goes to the OAuth token endpoint, not the API. There is no OAuth login screen on the public site.
- **Projection** (`lib/plan/projection.ts`): initiative and step titles, done or open, due date and milestone (a `Milestone:` prefix, or Asana's own milestone type). Provider responses are parsed with schemas that keep only those fields, so notes, assignees, comments, attachments, tags, followers, custom fields and raw payloads are dropped at the boundary, before anything is stored. Titles are cleaned of control and bidi characters, limited to 200 characters and checked by the repository guards (private identifiers, long IDs, secrets, retired copy) and the copy guards, plus plan-specific checks: no email, phone number or link, no naming of the other initiative, no handoff or ownership claim (A-10), never the project's own ID. A hit withholds the item; a withheld initiative takes its steps with it; counts leave them out, and the page says how many items are held back. Logs carry rule IDs and counts, never titles (Q-9). A title that mentions suicide carries the crisis block wherever it shows.
- **Public keys** (`lib/plan/keys.ts`): random, generated on the server. To keep them stable, a private index maps an HMAC-SHA-256 of each provider ID (keyed by `PLAN_KEY_SECRET`) to its key. The raw ID is never stored and the index is never served.
- **Persistence**: the existing `SnapshotStore` and table, under four keys: the projection, refresh metadata, the private key index, and an operator control record. No migration is needed.
- **Refresh**: the plan is a third job in `/api/cron/refresh`, reported on its own like the others. It reads at most once a minute (backing off to 15 minutes after failures) and only while `PLAN_ENABLED` is on. Pages and `/api/plan/onerhythm` read the stored projection only; nothing contacts Asana on a page request.
- **Schedule: not changed.** The cron stays at every fifteen minutes. A per-minute schedule is what PRD A-4's two-minute target needs, but adding it now would run the job 1,440 times a day for a disabled feature, and whether the Vercel plan allows it is unconfirmed. With the fifteen-minute schedule, a change appears within about fifteen minutes. Switching `vercel.json` to `* * * * *` is a one-line pull request at activation, once Matthew confirms the plan allows it (`docs/ops/plan.md`, step 7). The code's one-minute floor already covers either schedule.
- **States**: a read older than 30 minutes is labeled stale in server-rendered HTML. A failed read keeps the last good projection and its actual read time. An empty successful read (including one where every item is withheld) is held: the page says so and shows neither the empty plan nor the older one until the operator sets `publishEmpty` or a non-empty read arrives (A-8). Without the control record, the plan shows nothing rather than risk showing a withdrawn plan.
- **Withdrawal**: applied at read time from the control record, which the owner writes by hand. It removes the plan from the page, the API and Home at once, without a redeploy, a refresh or the provider, and the refresh job stops reading. `PLAN_ENABLED` off does the same after a redeploy.
- **Page**: `/plan/onerhythm` renders in full on the server and works without JavaScript. With JavaScript it polls `/api/plan/onerhythm` (no-store) every 60 s while visible, stops while hidden, and reloads on a 404 so a withdrawal leaves the screen. Milestones differ by the word "Milestone:" and bold weight; states are words. No Asana embed or link (A-10). Home's summary reads the same snapshot.

## Not verified

The build session could not reach Asana's documentation (blocked by its network policy). These come from the PRD's cited sources and widely documented behaviour, and are checked at activation (`docs/ops/plan.md`, step 9):

- that `tasks:read` covers both endpoints;
- that `urn:ietf:wg:oauth:2.0:oob` is accepted as a redirect URI;
- that a refresh-token exchange returns `expires_in` and no new refresh token (the code logs if one arrives);
- that project tasks come back in project order.
