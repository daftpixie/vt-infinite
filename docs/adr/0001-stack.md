# ADR 0001: Stack, hosting model and configuration boundaries

- Status: proposed (stage 1 pull request)
- Date: 2026-10-06
- Decider: Matthew J Adams

## Context

The site is rebuilt from an empty public repository. The internal PRD asks the build to choose supported stable versions at kickoff, verify them against official documentation, pin them, and record the choice. It expects a server-rendered TypeScript application, with Next.js as the expected framework.

## Decision

Versions were read from the npm registry and nodejs.org on 6 Oct 2026 and pinned exactly.

| Component | Version | Why this version |
| --- | --- | --- |
| Node.js | 24.21.0 | Current Active LTS line ("Krypton"); Node 26 is not yet LTS. Checksum verified against nodejs.org `SHASUMS256.txt`. |
| Next.js | 16.4.0 | `latest` on npm. App Router, `proxy.ts` (the Next 16 name for middleware), Node.js runtime by default. |
| React / React DOM | 19.3.0 | `latest`; within Next 16.4's peer range. |
| TypeScript | 6.0.3 | Latest 6.x. TypeScript 7.0.2 is `latest`, but it has no JavaScript compiler API yet, and typescript-eslint 8.71 supports `<6.1.0`. Next 16.4 documents TypeScript 7 support through its CLI checker; revisit when typescript-eslint supports 7. |
| ESLint | 10.12.0 with `eslint-config-next` 16.4.0 | Next 16 removed `next lint`; its docs prescribe the ESLint CLI with a flat config. |
| Vitest | 5.0.3 | Unit tests. Supports Node 22.12+ and 24. |
| Playwright | 1.63.0 with `@axe-core/playwright` 4.13.0 | End-to-end, keyboard and axe accessibility checks. |
| secretlint | 13.0.7 with the recommended preset | Secret scan in pre-commit and CI, alongside the repository's own guards. |
| Husky | 9.1.7 | Installs the pre-commit hook. |
| JetBrains Mono | 2.304 | The brand reference's version; variable fonts from the official repository's `v2.304` tag, subset to WOFF2 with fontTools 4.60.1. |
| GitHub Actions | `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `actions/upload-artifact` v7.0.1 | Pinned by commit SHA. |

Documentation checked: Next.js 16.4.0 docs (from the `v16.4.0` tag of the Next.js repository and the copy bundled in the package) for installation, TypeScript, ESLint, proxy, `notFound`, runtime environment variables and Content Security Policy. Several official documentation sites (nextjs.org, playwright.dev, vitest.dev) were not reachable from the build environment; their versions were verified from the npm registry and package metadata instead.

### Hosting model (proposed; needs Matthew's decision)

Vercel, with production deploying from `main` after cutover and previews per pull request. Vercel's Hobby plan is described as non-commercial personal use only, so a company site needs Pro or Vercel's written agreement before cutover. Flags and configuration are read per request on the server, so one build can be promoted between environments.

### Persistent storage for approved snapshots (PRD §19)

Proposed: a dedicated Postgres project (Supabase, if selected) used only by this site, with separate roles for public reads, moderation writes and finance processing. Approved stream and plan snapshots, moderation state and the explorer index persist there, so a deployment or cold start never erases the last good read. Sealed Marrs Rover bundles go to versioned object storage with an independent mirror. Nothing is provisioned in stage 1.

### Configuration and secrets

- Public, committed: route table, feature-flag names, old-URL table, design tokens.
- Private, host environment only: flag values per environment, provider OAuth secrets, database credentials, the plan project ID, webhook secrets, admin identity allowlist.
- Never in the web runtime or repository: signing keys, evidence salts, private financial records.
- CI reads an optional `PRIVATE_IDENTIFIERS` secret so the guard can refuse private values without the repository naming them.

## Consequences

- Pinned versions are upgraded deliberately, in their own pull requests.
- The content-security policy allows inline scripts until a nonce-based policy is introduced before cutover.
