# The Signal validation — 31 October 2026

Feature branch: `feat/the-signal`, PR [#24](https://github.com/daftpixie/vt-infinite/pull/24), based on current `main` at `1c35010ab25e528dfd285c42c0a0b977c806916e`. No merge or production release was performed.

## Final checks

`npm run verify` completed with **exit 0** after the enlarged-text hero/footer fixes. Environment: Node 24.21.0, Next.js 16.4.0, Chromium 154.0.8037.57 on Debian 13, disposable local Postgres 16.15. `SNAPSHOT_TEST_DATABASE_URL` selected that disposable database; `PW_CHROMIUM_EXECUTABLE` selected the installed browser. No hosted database or Plausible credential was used.

| Command | Actual result |
| --- | --- |
| `npm run lint` | Exit 0; `eslint --max-warnings=0` |
| `npm run typecheck` | Exit 0; route types generated and TypeScript passed |
| `npm test` | 35 files passed; 839 tests passed, 3 conditional release-gate tests skipped; 842 total |
| `npm run guard` | 457 files checked; no findings in the full verification run |
| `npm run secrets` | Exit 0; no secretlint findings |
| `npm run ledger` | All release steps returned their expected results, including rejection of the deliberately tampered fixture and reproduction of all 14 golden vectors |
| `npm run build` | Exit 0; optimized production build compiled and completed |
| `npm run build:noproxy` | Exit 0; landing release gate: 7 passed, 1 conditional skip; optimized landing build completed without the proxy |
| `npm run test:e2e` | **494 passed (4.2 minutes)**, no failures |

The final lockfile changes add only pinned `server-only@0.0.1`; unrelated package metadata was retained. `npm ci --dry-run --ignore-scripts` also returned exit 0. Screenshots, this report and comment updates are added after the full run without changing runtime behavior. Follow-up guards checked **460 files with no findings**, and secret scanning returned **exit 0** for the review artifacts.

The Postgres suite ran, rather than being skipped: 32 concurrent claims over independent connections produced one refresh winner; expired leases could be reclaimed, stale owners could not extend a successor's lease, the page-reader role could not read the lease table, and a validated last-good aggregate survived a new adapter instance.

Mocked-response tests cover default-off isolation, missing credentials/storage, exact windows and BPM, daylight-saving boundaries, successful empty results, malformed responses, authentication/plan/rate-limit errors, shared refresh/cache reuse, original stale timestamps, source grouping and truncation refusal, secret boundaries and narrow CSP construction. The browser suite covers route isolation, both themes, keyboard focus/start/pause, reduced motion, no JavaScript, polling visibility, removal on disable, client bundle boundaries, 320 px/200% reflow and serious/critical axe findings. The full-page enlarged-text measurement after the fix was viewport 320 px, scroll width 320 px.

## Confirmed collection blocker

The supplied public script was downloaded outside the working tree and executed **offline**, with a substituted transport and browser environment, by `tests/check-plausible-script.mjs`. Actual output:

```text
Initial + eligible navigation pageviews: 3 (expected 3).
Private route pageviews: 0 (expected 0).
Unexpected event types: engagement.
```

The probe returned exit 1, correctly rejecting the current script's pageview-only contract. It sent no requests to the production analytics site. The module does not work around visitor blocking or enable localhost capture. Collection remains fail-closed in both rendering and the production release check; see [ADR 0011](../adr/0011-the-signal.md).

## Review screenshots

These are **synthetic local projections, not live traffic**. The screenshots include a review label added around the module; the data and module rendering are unchanged. The stored test projection is served as stale, with collection off.

[Compact, dark theme](../previews/the-signal-compact.png) · [Expanded, light theme](../previews/the-signal-expanded.png)

## Remaining manual checks

Neither `PLAUSIBLE_SITE_ID` nor `PLAUSIBLE_API_KEY` was configured in this environment. No authenticated Stats API request succeeded or was claimed. The exact account site identifier, account Reporting Timezone, Stats API entitlement, production credentials/settings and live delivery remain unverified. A script download does not establish authenticated Stats API connectivity.

VoiceOver/NVDA and the human WCAG review, real-device performance, provider fix/transport verification, Matthew's database migration and production activation are still required as applicable. The repository's private-identifier secret is checked separately by GitHub Actions; local verification does not establish that secret's presence. Consult the PR checks for remote CI status.

The five-variable contract, separate collection/publication flags, Vercel Config/Secret setup, account checks, activation limits and rollback are in [the operations guide](../ops/the-signal.md). Matthew alone controls release; keep `SITE_MODE` unchanged.
