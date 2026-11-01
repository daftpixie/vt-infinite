# The Signal validation — final readiness pass, 1 November 2026

This pass on `feat/the-signal`, draft PR [#24](https://github.com/daftpixie/vt-infinite/pull/24), starts at reviewed head `d20a8d12dd54859ab29a4d84c88543fe47af5b33`. The current PR/remote head was fetched and inspected; there were no newer commits to preserve. The collection, display and aggregate backend are unchanged. No merge, production deployment, hosted configuration change, protection bypass or remote migration was performed.

Owner-confirmed: five Plausible variables saved in Vercel; site identifier and `America/New_York` timezone checked; both feature flags false; both `site.public_snapshots` and `site.pulse_refresh_leases` exist; the latest handoff’s visual, screen-reader/accessibility and device review is complete. These confirmations were not personally repeated by this session. Matthew acknowledges continuing Stats API access after trial; no paid subscription or authenticated result is inferred. `SITE_MODE` stays unchanged.

## Preflight correction

The P2 defect was a false-ready result when the refresher lacked snapshot write grants. It was a defect in the operator check, not evidence of incorrect hosted grants. The actual preflight now requires and reports refresher snapshot SELECT/INSERT/UPDATE, schema USAGE, expected role/LOGIN, required lease grants and RLS enabled on each table. It also rejects reader snapshot writes/lease access (including column grants) and refresher DELETE on either table. Missing/null findings fail closed. The CLI exits 0 only for `ready: true`; an unresolved prerequisite or violated restriction gives exit 2.

All hosted database statements are fixed catalog SELECTs inside read-only transactions. Catalog readiness does **not** prove a real hosted write will pass applicable policies. A local test deliberately removes an INSERT policy: grants and enabled RLS still pass the specified catalog checks, while the actual restricted write fails. No hosted insert/update/delete, lease claim or write-and-rollback probe is used.

Historical reference at `d20a8d1`: 853 unit tests passed, 3 conditional skips; 496 browser tests passed, including seven real Postgres tests in the unit count. Those results are not reused as acceptance evidence for this pass.

## Local checks

Current `npm run verify` completed with **exit 0**. Environment: Node 24.21.0, Next.js 16.4.0, Chromium 154.0.8037.57 on Debian 13, disposable local Postgres 16.15. `SNAPSHOT_TEST_DATABASE_URL` selected only that local database; `PW_CHROMIUM_EXECUTABLE` selected the installed browser. Collection was off in application browser tests. No hosted database or Stats API credential was used.

| Check | Actual result |
| --- | --- |
| `npm run lint` | Exit 0; zero warnings |
| `npm run typecheck` | Exit 0; generated route types and TypeScript passed |
| `npm test` | **38 files passed; 875 passed, 3 conditional release-gate skips; 878 total** |
| `npm run guard` | 467 files checked; no findings |
| `npm run secrets` | Exit 0; no findings |
| `npm run ledger` | All expected results, including deliberate tamper rejection and reproduction of all 14 golden vectors |
| `npm run build` | Exit 0; optimized production build completed |
| `npm run build:noproxy` | Exit 0; landing release gate 7 passed, 1 conditional skip; optimized landing build completed |
| `npm run test:e2e` | **496 passed (4.7 minutes)**; no failures |
| Focused preflight + disposable Postgres regression | **2 files, 33 tests passed (1.32 seconds)** |
| `node tests/check-plausible-script.mjs` | Exit 0; shipped collector’s offline privacy contract passed |
| Vendor comparison probe | Historical `d20a8d1` evidence: expected exit 1 for private-context engagement; not rerun for this operator-only fix |
| `node scripts/signal-preflight.mjs` | Exit 2; live Stats/database checks skipped because authorized bindings are absent here |

The three unit skips are environment-dependent landing, plan and now-playing release assertions. Their ordinary tests/subprocess checks run; the landing assertion additionally runs during the landing build. Both the focused and full unit runs included **20 real Postgres tests**, with no database skips. No dependency or lockfile change is needed for this correction.

The disposable database setup applies 0001 then 0002 **locally only**. New tests invoke the actual preflight SQL over separate connections authenticated as `site_reader` and `site_refresher`; only the local TLS adapter and Stats response are substituted. Removing each refresher snapshot grant individually gives not-ready/`ready: false`; every case restores its grant. Excess reader table/column access and either refresher DELETE grant also fail. Correct grants pass, with actual local snapshot insert/update/read success and prohibited reader operations/refresher deletes denied. Missing schema USAGE reports not-ready. The RLS-policy counterexample above documents the limit of the read-only check. All permission/policy changes are isolated to the local database and restored between cases.

Existing local tests also retain the 32-claim single refresh winner, lease expiry/ownership protection, last-good projection restart recovery and restricted-role behavior. These are disposable local results, not proof of hosted logins, transaction-pooler connections, RLS write success or shared cache behavior across deployed instances.

Aggregate regression coverage retains fixed queries, exact five-minute BPM and 24 elapsed-hour windows, both daylight-saving transitions, source suppression/completeness, shared cache/coalescing, original stale timestamps, backoff, successful empty versus failed/unavailable results, missing credentials, secret boundaries and flag-off isolation. The 360-requests/hour budget and historical concurrency 4 are unchanged; no live latency is inferred from mocks.

Application browser coverage includes landing route isolation, default-off collection, bundle boundaries, both themes, keyboard start/pause and disclosure, reduced motion, no JavaScript, hidden-tab polling, removal after publication-off, and fresh-zero → stale-zero → unavailable transitions. Native disclosures initially hide the hourly count table; expanded summaries precede evidence. Automated browser results are distinct from Matthew’s confirmed human visual/accessibility/device review.

## Transport evidence and decision

The historical `d20a8d1` transport review retrieved the supplied script read-only outside the repository and executed it unchanged in an offline browser model with intercepted transport. Under the final policy, the engagement event name alone is not a failure. Its **private-context behavior** is the failure: initial public page, replace into an admin URL, scroll, five seconds elapsed, blur. Its engagement path bypassed the pageview transform and included private-context activity while retaining the previous public URL. This readiness pass preserves the selected direct Events API collector.

Sanitized vendor comparison findings:

```text
Event types: pageview, engagement
Field names: d, e, n, r, sd, u, v
Private-context emissions: 1
Route exclusion: fail (exit 1)
```

The implemented alternative uses the supported direct browser **Events API**, choosing pageviews only within the broader allowed measurement policy. No vendor script, legacy snippet, global transport/History patch, proxy, undocumented flag or blocking bypass is installed. The previous unconditional production refusal and `PAGEVIEW_ONLY_SCRIPT_VERIFIED` hold are removed after verifying this transport. See [ADR 0011](../adr/0011-the-signal.md).

Actual shipped-collector probe findings:

```text
Scope: offline intercepted Events API
Event types: pageview
Field names: domain, name, referrer, url
Initial/navigation/restoration events: 7 (expected 7)
Privacy contract: pass (exit 0)
```

Unit tests intercept the shipped native fetch transport and invoke the actual root collection component’s effects through an offline hook/Next-pathname model. They cover initial load, effect replay, push/replace, same-path changes, back/forward, private visits and returns, back/forward-cache restoration, queries/fragments, external/internal referrers, hidden tabs, scroll/blur/time, and opt-out/automation/local exclusions. No allowed producer exists for engagement, outbound links, downloads or forms. Only a latest approved public path and sent bit are retained; no browser analytics storage is written. Requests omit credentials and the raw referrer header, whitelist fields, and never retry blocked/failed delivery. CSP permits only the exact Events API connect path; production prerendering/CSP remain correct under Vercel’s build-time `CI=1` marker.

No synthetic traffic was sent to Plausible. Offline effect/transport models and collection-off browser checks are distinguished from actual hosted collection delivery, which remains an activation check.

## Review screenshots

The four screenshots from `d20a8d1` remain representative: no display code changed. All show **synthetic local projections, collection off**, with a visible review label. They are stale test snapshots, not production traffic. One schematic ECG-style motif represents each real bucket in a production snapshot; amplitude follows the bucket count, zero remains flat, and glyph positions imply no event timing or medical meaning. Matthew confirms the visual/accessibility/device review from the latest handoff.

| Variant | Dark | Light |
| --- | --- | --- |
| Compact landing | [Screenshot](../previews/the-signal-compact-dark.png) | [Screenshot](../previews/the-signal-compact-light.png) |
| Expanded homepage | [Screenshot](../previews/the-signal-expanded-dark.png) | [Screenshot](../previews/the-signal-expanded-light.png) |

## Live verification and owner actions

After the fix, `node scripts/signal-preflight.mjs` returned **exit 2**, `ready: false`, `storageConfigured: false`, Stats **skipped** and both role checks **skipped**. Missing session bindings are exactly `PLAUSIBLE_SITE_ID`, `PLAUSIBLE_API_KEY`, `SNAPSHOT_STORE`, `SNAPSHOT_DATABASE_URL_READ`, `SNAPSHOT_DATABASE_URL_REFRESH`. No authorized bindings are available; no authenticated HTTP status/result or live latency is claimed. This is not a claim that saved Vercel values are absent. No secrets were retrieved, exported, rotated, written to files or requested in chat.

Both hosted tables exist by Matthew’s SQL confirmation. Restricted-role logins, grants and connection readiness remain unverified here; no hosted permission defect has been demonstrated. **Do not rerun 0001/0002 or recreate correct credentials.** The [operator checklist](../ops/the-signal.md) records the exact boolean contract and all eight application variables. In the project terminal with Node 24 and existing authorized secure bindings, the owner command is:

```sh
node scripts/signal-preflight.mjs
```

This is a Node command, not SQL Editor input. Expected success is exit 0 / `ready: true`, `storageConfigured: true`, a valid Stats result with successful HTTP status/measured latency, both intended restricted connections `status: ready`, required booleans true and prohibited booleans false. It establishes only those read-only checks, not hosted snapshot writes, deployed cache behavior or browser delivery. Preserve existing correct connection values; prepare a targeted owner-reviewed repair only if a specific failed finding warrants one.

Outstanding owner actions: complete the bounded authenticated API/restricted-connection checks where authorized bindings exist, review the final code/evidence and decide release timing. Continuing Stats API access remains an operating requirement already acknowledged by Matthew, with no subscription status inferred. The visual, screen-reader/accessibility and device-review item is owner-confirmed rather than pending. After Matthew approves activation, verify a real eligible browser visit counts once and aggregates refresh after their cache intervals, including hosted snapshot/RLS/cache behavior and honest unavailable/stale states. No synthetic production events or activation are part of this session. Keep both flags false and `SITE_MODE` unchanged; the PR remains draft as requested. GitHub Actions for the final pushed commit supplies CI/private-identifier evidence separately from local results; consult the PR checks.
