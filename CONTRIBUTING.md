# Contributing

Matthew J Adams is the product owner and decides what ships. Contributions, including those from AI build sessions, follow these rules. A rule here changes only with Matthew's explicit say.

## How changes land

- Work on a feature branch and open a pull request into `main`. Nobody pushes to `main` directly.
- CI must pass: lint, typecheck, unit tests, guards, secret scan, build, and the end-to-end suite (routes, keyboard, flags, old URLs, accessibility, rendered copy).
- A build session never merges, deploys to production, changes DNS or domains, changes repository visibility or settings, or deletes branches, tags or remote resources.
- Never report a check as passed without its output.

## This repository is public

- Write every file, commit message and pull request as if anyone will read it, because anyone can.
- Never commit secrets, `.env` files, tokens, keypairs (`*-keypair.json`, `target/`, Solana CLI configuration) or private keys. The pre-commit hook and CI scan for them; GitHub secret scanning and push protection are on as well.
- The internal PRD and brand reference stay out of this repository. Never commit them, copy files from where they are kept, name their location, or quote them at length. A public excerpt (`docs/spec-public.md`) is committed only after Matthew approves its redaction list.
- Provider IDs, private project names and other private configuration live only in the host's environment.
- Nothing from the previous site is copied here: no code, copy, assets, constants or content.

## Chain and money

- No Solana program deploy and no transaction on any network. Devnet work waits for Matthew's recorded approval; mainnet is out of scope for build sessions.
- Marrs Rover shows synthetic, labeled demo data until the real-data gates clear. Demo pages use demo or future wording, never present tense about real money.

## Copy and claims

The guards in `guards/rules.mjs` enforce these on every pull request; a legitimate exception is recorded in `guards/exceptions.json` with a reason and the approver, never silenced in place.

- Never invent content, numbers, results, addresses, costs, people, dates or quotes. Missing copy becomes a visible placeholder registered in `lib/placeholders.ts`.
- VT Infinite, Inc. is a Delaware C-corp. A planned conversion is drafted, not filed; public copy does not mention it until counsel signs off.
- No funding asks, investment language or donation language. The brand reference's words-to-avoid list applies to public copy.
- Two of the initiatives are never named in the same claim; the `initiative-pairing` guard names them.
- Wherever suicide is mentioned, the crisis-support block (`components/CrisisSupport.tsx`) appears with its wording unchanged.
- The byline is "Matthew J Adams", with no period. Marrs Rover has two Rs. Any sentence about the person it is named for stays a placeholder until Matthew supplies approved text.
- No analytics, tracking pixels, third-party scripts or cookies beyond what the PRD permits.

## Accessibility

WCAG 2.2 AA blocks release. Automated axe checks fail CI on serious or critical issues; they do not replace the manual review the PRD requires.
