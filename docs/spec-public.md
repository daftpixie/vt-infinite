# vt-infinite.com: public specification

**Status:** excerpt of the internal product requirements (v0.3.1, 6 Oct 2026). It states design intent and build requirements. It does not say any feature is live.

## Purpose
vt-infinite.com is the public home for Matthew J Adams's writing, VT Infinite's work, its code and progress, music and contact. It also gives a public account of how the organization uses resources and a brief explanation of its proposed corporate governance. People should be able to read the work, inspect its evidence, understand what is being built and ask where the money went. Machine assistance can screen, format or flag inconsistencies. A person owns editorial judgment, financial approval, privacy decisions and every published claim.

**Out of scope for this release:** member features of any initiative, patient data, public logins, commerce, investment solicitation, token issuance, payment execution, live voting or enrollment.

## Routes
Header: Home · Words · Code · Vibes · Agency · Contact. Marrs Rover and Proposed governance are linked from Home and the footer.
`/`, `/words`, `/words/[slug]`, `/words/feed.xml`, `/code`, `/the-record`, `/the-record/[slug]`, `/the-record/feed.xml`, `/vibes`, `/agency`, `/contact`, `/governance`, `/plan/onerhythm`, `/marrs-rover`, `/marrs-rover/[entity]/periods/[period]`, `/marrs-rover/[entity]/events/[eventId]`, `/marrs-rover/[entity]/budgets/[budgetId]`, `/marrs-rover/reviews/[reviewId]`, `/marrs-rover/verify`, `/marrs-rover/method`, `/policies/comments`, `/policies/privacy`, `/policies/terms`, `/admin` (private).

## Design
Black and white, square corners, no gradients or shadows. Self-hosted JetBrains Mono, body text at least 16 px, dark default with a light inversion. States are never shown by color alone. WCAG 2.2 AA blocks release.

## Publishing
- Essays are reviewed local files with a strict schema: draft, held or published.
  - Published essays need a recorded second read.
  - At least 48 elapsed hours must pass between final text and publication, measured with ISO 8601 timestamps.
  - A mirror never precedes its first publication.
  - Corrections are dated and shown first.
- Imported feed text and public submissions are inert text, never executable content.
- RSS and sitemaps include published local content only.

## Integrations
- Third-party content is fetched server-side from an allowlist, validated, reduced to approved public fields and persisted. A deployment or outage never erases the last good read. Stale data is labeled.
- There is no audience analytics, advertising pixel or off-site tracking.
- Spotify "now playing" uses the founder's authorization only. A plan projection shows only approved titles, states and dates.

## Participation
- Comments and playlist additions are published only after a person approves them. Bot checks and rate limits are abuse controls, not identity.
- A self-harm flag shows crisis support immediately: "If you are thinking about suicide, call or text 988 in the US, or your local crisis line. If your heart is in trouble right now, call 911 or your local emergency number, or follow the plan your care team gave you."
- Participation stays closed until its policies are approved.

## Marrs Rover Block Explorer
- **Demo first.** The first release shows a working demo built on synthetic records. Every page, table, export and proof is labeled "Demo data — not VT Infinite's financial records." Real data appears only after accounting, scope, privacy, authorization, archive and independent-review gates clear.
- **What the pages show.** Before any technical proof, pages show entity, period, cutoff, basis, coverage, money movement, restrictions and unresolved issues.
- **Separate states.** Publication, chain commitment, reconciliation, independent review, exceptions and freshness are separate states. One "verified" badge never stands for all of them.
- **Proofs.**
  - Canonical bytes follow RFC 8785.
  - Merkle leaves are `SHA256(0x00 || bytes)` and parents are `SHA256(0x01 || left || right)`.
  - An odd final node is promoted unchanged.
  - Leaf count is bound into the root.
  - Golden vectors and a tampered bundle are published.
  - An independent CLI verifier comes first; a browser verifier follows.
- **Limits.** A matching root shows that a bundle matches a recorded commitment. It doesn't show the source records are legitimate, the accounts complete, or that any audit took place.
- **Network path.** The path is local, then Solana devnet, then a limited reviewed mainnet pilot, each step behind explicit authorization. No project token is created.

## Proposed governance
`/governance` gives a brief summary marked "Proposed — not yet adopted". It offers no participation, voting, wallet or demonstration. Any governance code stays behind server-side switches that are off by default and return 404.

## Release gates
- Replacement and rollback
- Brand and copy
- Participation policies
- Held content
- Plan projection
- Marrs Rover demo
- Devnet
- Real finance
- Mainnet pilot
- Independent-review label
- Corporate status
- Governance summary
- Governance demonstration
- Live governance

Each gate needs its own evidence before the feature it guards activates.

## Build stages
0. Baseline
1. Foundation
2. Public hub
3. Plan projection
4. Marrs Rover local demo and verifier
5. Cutover
6. Participation
7. Devnet
8. Reviewed real pilot
9. Operational refinement
