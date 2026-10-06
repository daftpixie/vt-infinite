# ADR 0002: Snapshot storage and publication streams

- Status: proposed (stage 2a pull request)
- Date: 2026-10-06
- Decider: Matthew J Adams

## Context

The PRD (§19, SS-5, A-8) requires the last validated read of each upstream source to persist across deployments and cold starts, independent of framework caches. The hosting and database choice is still open (ADR 0001).

## Decision

- **One storage interface**, `SnapshotStore` (`lib/storage/`), with a file adapter for local work and tests, and a Postgres adapter written against a minimal `SqlClient` interface. No database driver is installed and nothing is provisioned. `db/migrations/0001_public_snapshots.sql` defines the table for when one is.
- **The file adapter is not a production store.** On serverless hosting the filesystem is ephemeral, so production needs the Postgres adapter (or another persistent adapter) wired to a real database before streams can be relied on. Until then, a cold start shows "Publication feed unavailable" rather than inventing content.
- **Streams** (`lib/streams/`): allowlisted publications in `content/streams.json`; server-side fetch with a 10 s timeout, 2 MiB cap, identifying user agent, conditional requests, no redirects; a 15-minute floor per feed with exponential backoff to 6 hours after failures; documents with a DOCTYPE are refused, so no XML entity can expand; items keep metadata and a link only; guards withhold items carrying private identifiers or secrets and keep institutional-claim matches off Home; a withdrawal list removes items at read time on every surface.
- **Stale threshold** for stream reads: 60 minutes (four refresh floors). This is a working default for Matthew to confirm.
- **Dependencies added**: `zod` 4.6.5 (schemas), `fast-xml-parser` 5.11.2 (RSS parsing), both pinned exactly.

## Open

- Recorded current examples of the two live feeds (SS-3). The build environment could not reach substack.com, so tests use synthetic fixtures in `tests/fixtures/feeds/`.
- Notes (SS-8) are not built: there is no documented source, and scraping is out of scope.
