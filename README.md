# vt-infinite.com

The website of VT Infinite, Inc., rebuilt from an empty repository. This repository is public: every commit is readable the moment it is pushed.

**Status: unreleased.** Production still serves the previous site. Every page here is a shell in an honest unreleased state, with visible placeholders where approved copy or facts have not been supplied. Nothing in this tree is live.

## What is here

| Path | What it holds |
| --- | --- |
| `app/` | Next.js App Router routes: one shell per route in the internal PRD's information architecture |
| `components/` | Header navigation, footer, theme switch, crisis-support block, placeholders |
| `lib/` | Feature flags, request-time access rules, route table, RSS, security headers |
| `proxy.ts` | Request-time gate: admin and flagged features return 404; retired URLs return 410 |
| `content/` | Reviewed content and configuration (only the old-URL table so far) |
| `guards/`, `scripts/guard.mjs` | Copy, claim, private-identifier and secret guards |
| `tests/unit/` | Vitest: flags, access rules, guards, fresh-tree checks, route contracts |
| `tests/e2e/` | Playwright: routes, keyboard, flags, old URLs, axe accessibility, rendered copy |
| `public/fonts/` | JetBrains Mono v2.304, subset to WOFF2, with its SIL Open Font License |
| `docs/adr/` | Architecture decisions |

## Run it

Requires Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev            # http://localhost:3000
```

## Verify it

Each command is also a CI step on every pull request.

```bash
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # Next.js route types, then tsc
npm test               # unit tests, including the repository guard scan
npm run guard          # copy, claim, private-identifier and secret guards
npm run secrets        # secretlint
npm run build          # production build
npx playwright install chromium   # once
npm run test:e2e       # builds must exist; starts `next start` on port 3100
```

`npm run verify` runs all of them in order. On a machine with Chromium already installed, set `PW_CHROMIUM_EXECUTABLE` to its path instead of downloading one.

## Feature flags

Server-side only. A flag is on only when its variable is exactly `true`; unset means off. When off, the gated pages and APIs return 404, and no request parameter, cookie or header can turn them on.

| Variable | Gates |
| --- | --- |
| `GOVERNANCE_DEMO_ENABLED` | `/governance/demo/*`, `/api/governance/demo/*` |
| `GOVERNANCE_LIVE_ENABLED` | `/governance/live/*`, `/api/governance/live/*` |
| `PLAN_ENABLED` | `/plan/onerhythm`, `/api/plan/*` |
| `COMMENTS_ENABLED` | `/api/comments/*` |
| `PLAYLIST_ENABLED` | `/vibes/playlist/*`, `/api/playlist/*` |
| `MARRS_ROVER_REAL_DATA_ENABLED` | Marrs Rover routes for any entity other than the synthetic `demo` entity |
| `MANDELBROT_ENABLED` | The Mandelbrot figure on Agency and `/figures/mandelbrot-still.png`, held until Matthew approves its kernel (P7) |

`/admin` and `/api/admin` return 404 for every request until authentication and storage exist.

Storage and upstream reads (server-side only):

| Variable | Meaning |
| --- | --- |
| `SNAPSHOT_STORE` | `file` (default) or `postgres` (Production; see `docs/ops/database.md`) |
| `SNAPSHOT_DIR` | Directory for the file store (default `.data/snapshots`, gitignored) |
| `SNAPSHOT_DATABASE_URL_READ` | Pooler URL for the read-only role, used by pages; required with `postgres` |
| `SNAPSHOT_DATABASE_URL_REFRESH` | Pooler URL for the refresher role, used by the refresh job; required with `postgres` |
| `CRON_SECRET` | Bearer secret Vercel Cron sends to `/api/cron/refresh`; without it the route answers 404 |
| `UPSTREAM_REFRESH` | `off` stops all provider fetches (tests, offline work); anything else allows them |

Essays and Record entries are reviewed files under `content/essays/<slug>/index.mdx` and `content/record/<slug>.mdx`, validated by strict schemas (`lib/content/`). Only `published` pieces whose `publishAt` has passed reach pages, feeds or the sitemap. Tests point `ESSAYS_DIR` and `RECORD_DIR` at `tests/fixtures/`, which the loader refuses unless `ALLOW_CONTENT_FIXTURES=true`.

Publication streams are allowlisted in `content/streams.json`. Pages only read persisted snapshots. Providers are contacted only by `/api/cron/refresh`, which Vercel Cron calls every fifteen minutes (`vercel.json`); feeds keep a fifteen-minute floor with backoff, repositories refresh at most hourly, and a failed refresh never replaces the last good read. Locally, `CRON_SECRET=<value> npm run refresh` triggers the same route on a running server.

Other environment variables: `SITE_URL` (defaults to `https://vt-infinite.com`), and in CI the `PRIVATE_IDENTIFIERS` Actions secret: comma-separated values the guard must never find, matched regardless of case, punctuation, hyphens and underscores. CI fails if the secret is empty, except on pull requests from forks, which cannot read secrets and get a warning instead. Configuration values that are private live only in the host's environment, never in this repository.

## Licenses

Code: Apache License 2.0 (`LICENSE`). Fonts: SIL Open Font License 1.1 (`public/fonts/OFL.txt`). Licensing for site copy and essays has not been decided; until it is, they are not covered by the code license.

## Contributing

Read `CONTRIBUTING.md` before opening a pull request. Report security issues as described in `SECURITY.md`.
