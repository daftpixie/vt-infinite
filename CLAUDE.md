# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## Read first

1. `CONTRIBUTING.md`: the hard rules. They bind every session.
2. The internal PRD (v0.3.1 or later) and the signed brand reference (v1.1). Both are internal documents kept **outside** this repository. The kickoff prompt for each session says where to read them. Clone or read them outside this working tree, never inside it or as a submodule. If you cannot read them, stop and tell Matthew; do not work from memory or summaries.
3. Order of authority: Matthew's instructions in the current session, then the PRD, then the brand reference. If the PRD and brand reference conflict, stop and report it.

Never commit the PRD or brand reference, copy files from where they are kept, name their location, quote them at length, or put their private identifiers in code, comments, commits or pull requests.

## Stage

Stages 1 to 4b and the stage 4 follow-ups are merged. Stage 5L, the landing release, is in progress: part A (landing mode and page, ADR 0006), then part B (the email list), then part C (the cutover runbook), each after Matthew merges the one before. Do not cut over until Matthew says so.

## Working here

- Node 24 (`.nvmrc`). Dependencies are pinned exactly (`.npmrc` sets `save-exact`).
- Next.js 16 App Router. Next.js docs for the installed version are bundled at `node_modules/next/dist/docs/`; prefer them to memory.
- `npm run verify` runs every check CI runs. Report each command with its output.
- New routes go in `lib/routes.ts` first; tests read that table.
- Gated features are added to `GATED_PREFIXES` in `lib/access.ts`, and the page repeats the flag check.
- `SITE_MODE=landing` serves only the landing release (`lib/mode.ts`, ADR 0006). A new full-site route calls `fullSiteOnly()` (pages) or `landingNotFound()` (route handlers) first; a landing route is added to `LANDING_PATHS` and the `landing` column of `lib/routes.ts`.
- Missing copy is a placeholder registered in `lib/placeholders.ts`, never an invented sentence.
- Retired legacy copy, which was already public, is kept out by hash (`guards/hashed-phrases.json`; add one with `printf '%s' 'phrase' | node scripts/hash-phrase.mjs retired`). Private identifiers are never hashed into this repository: they live only in the `PRIVATE_IDENTIFIERS` Actions secret, which the guard reads in CI.
- Marrs Rover proof work lives in `packages/ledger-proof`, `tools/ledger-exporter` and `tools/ledger-verifier` (ADR 0005). The verifier stays dependency-free and shares no code with the library. Fixtures in `fixtures/marrs-rover` are frozen by `SHA256SUMS`; `npm run ledger` runs the release checks.
- Never use the Vercel or Supabase connectors or CLIs to change anything. Migrations are files (`db/migrations/`); Matthew applies them (`docs/ops/database.md`).
- Design tokens in `app/globals.css` implement the brand reference §08–§13. Change them only with the reference.
