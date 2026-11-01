# The Signal validation — 1 November 2026

Follow-up on `feat/the-signal`, draft PR [#24](https://github.com/daftpixie/vt-infinite/pull/24), starting at reviewed head `50a81a762332ee57171767339ae8c1aff094c95f`. The remote head was checked; there were no newer commits to preserve. No merge, production deployment, hosted configuration change, protection bypass or remote migration was performed. Matthew’s confirmed five Plausible variables, both flags false, configured site identifier and `America/New_York` timezone remain accepted.

## Local checks

`npm run verify` completed with **exit 0**. Environment: Node 24.21.0, Next.js 16.4.0, Chromium 154.0.8037.57 on Debian 13, disposable local Postgres 16.15. `SNAPSHOT_TEST_DATABASE_URL` selected only that local database; `PW_CHROMIUM_EXECUTABLE` selected the installed browser. Collection was off in application browser tests. No hosted database or Stats API credential was used.

| Check | Actual result |
| --- | --- |
| `npm run lint` | Exit 0; zero warnings |
| `npm run typecheck` | Exit 0; generated route types and TypeScript passed |
| `npm test` | **38 files passed; 853 passed, 3 conditional release-gate skips; 856 total** |
| `npm run guard` | 469 files checked; no findings |
| `npm run secrets` | Exit 0; no findings |
| `npm run ledger` | All expected results, including deliberate tamper rejection and reproduction of all 14 golden vectors |
| `npm run build` | Exit 0; optimized production build completed |
| `npm run build:noproxy` | Exit 0; landing release gate 7 passed, 1 conditional skip; optimized landing build completed |
| `npm run test:e2e` | **496 passed (4.3 minutes)**; no failures |
| Focused Signal browser suite | **11 passed (26.5 seconds)** |
| `node tests/check-plausible-script.mjs` | Exit 0; shipped collector’s offline privacy contract passed |
| Vendor comparison probe | Expected exit 1; detected private-context engagement in the supplied v37 script |
| `node scripts/signal-preflight.mjs` | Exit 2; live Stats/database checks skipped because authorized bindings are absent here |

The three unit skips are environment-dependent landing, plan and now-playing release assertions. Their ordinary tests/subprocess checks run; the landing assertion additionally runs during the landing build. The **seven real Postgres tests ran**, including restricted-role behavior, rather than being skipped. No dependency or lockfile change was needed for this follow-up.

The disposable database checks applied 0001 then 0002 locally. Thirty-two concurrent claims using independent connections produced one refresh winner; expiry allowed reclamation, and an old owner could not extend its successor’s lease. Actual `site_refresher` privileges performed lease claims and projection writes; `site_reader` read projections but could neither write them nor read leases. A validated last-good projection survived adapter restart. These are local role tests, not proof of hosted logins or transaction-pooler connections.

Aggregate regression coverage retains fixed queries, exact five-minute BPM and 24 elapsed-hour windows, both daylight-saving transitions, source suppression/completeness, shared cache/coalescing, original stale timestamps, backoff, successful empty versus failed/unavailable results, missing credentials, secret boundaries and flag-off isolation. The 360-requests/hour budget and historical concurrency 4 are unchanged; no live latency is inferred from mocks.

Application browser coverage includes landing route isolation, default-off collection, bundle boundaries, both themes, keyboard start/pause and disclosure, reduced motion, no JavaScript, hidden-tab polling, removal after publication-off, and fresh-zero → stale-zero → unavailable transitions. Both variants pass 320 CSS px/200% text reflow and have no serious/critical automated axe findings. Native disclosures initially hide the hourly count table; expanded summaries precede evidence. Automated checks do not complete human accessibility review.

## Transport evidence and decision

The supplied public script was retrieved read-only outside the repository and executed unchanged in an offline browser model with intercepted transport. Under the final policy, the engagement event name alone is not a failure. Its **private-context behavior** is the failure: initial public page, replace into an admin URL, scroll, five seconds elapsed, blur. Its engagement path bypassed the pageview transform and included private-context activity while retaining the previous public URL.

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

All four show **synthetic local projections, collection off**, with a visible review label. They are stale test snapshots, not production traffic. One schematic ECG-style motif represents each real bucket in a production snapshot; amplitude follows the bucket count, zero remains flat, and glyph positions imply no event timing or medical meaning.

| Variant | Dark | Light |
| --- | --- | --- |
| Compact landing | [Screenshot](../previews/the-signal-compact-dark.png) | [Screenshot](../previews/the-signal-compact-light.png) |
| Expanded homepage | [Screenshot](../previews/the-signal-expanded-dark.png) | [Screenshot](../previews/the-signal-expanded-light.png) |

## Live verification and owner actions

Actual `signal-preflight` output reports `storageConfigured: false` in this environment, Stats check **skipped: authorized credential binding absent**, and both role checks **skipped: authorized connection binding absent**. The runtime has no authorized Plausible key or restricted database connections. Thus there is **no authenticated HTTP/result status or measured live latency**, and hosted table/role readiness remains unknown. This does not contradict Matthew’s confirmed Vercel values; they are not automatically available here. No credential request or replacement is needed from this build session.

Matthew’s SQL setup remains separate and unconfirmed: 0001 only if absent, then 0002, restricted-role logins and the existing reader/refresher transaction-pooler connections. SQL creates tables; Vercel variables configure application connections. The [operator checklist](../ops/the-signal.md) gives exact SQL order, non-secret checks, all eight variables, the read-only preflight, accepted confirmations, activation and independent rollback flags. Keep both hosted flags false and `SITE_MODE` unchanged until Matthew’s approved release.

Outstanding before readiness/release: authenticated Stats API validity/latency and entitlement, hosted schema/role/connection verification, human VoiceOver/NVDA and WCAG review, real-device performance, then real-visit delivery and aggregate/cache checks after Matthew’s authorized activation. No public diagnostic endpoint was added. The PR remains draft while essential hosted runtime verification is unresolved. Local guards cannot establish the repository’s `PRIVATE_IDENTIFIERS` secret; GitHub Actions separately checks it and scans private identifiers. Consult the PR checks for remote CI results.
