# ADR 0005: Marrs Rover proof format

- Status: proposed (stage 4a pull request)
- Date: 2026-10-07
- Decider: Matthew J Adams

## Context

Marrs Rover publishes an approved projection of the books so that a reader can check, without trusting the website, that a downloaded publication is complete relative to what was committed and that its totals add up. The PRD (MR-15 to MR-38, MR-45 to MR-49, R5) fixes most of the method: canonical JSON, a SHA-256 Merkle tree with domain-separated leaves and parents, an odd node that is promoted rather than duplicated, the leaf count bound into the root, golden vectors, a tampered bundle and an independent verifier. This record fixes the details the PRD leaves open and states the limits in plain words.

Everything built in this stage is local and synthetic. The chain state is always "not attempted". `MARRS_ROVER_REAL_DATA_ENABLED` stays off. No page changes.

## Decision

### Where the code lives

- `packages/ledger-proof/`: the schemas, strict JSON input, canonicalization, the Merkle tree, the register rules, the arithmetic, the bundle sealer and the privacy scan.
- `tools/ledger-exporter/`: books in, sealed bundle out, plus the golden-vector generator.
- `tools/ledger-verifier/`: the standalone verifier. It is plain JavaScript, needs Node.js 22 or later, has no dependencies and imports nothing outside its folder, so a reader can copy that folder alone and run it.
- `fixtures/marrs-rover/`: the frozen golden vectors, the MR-48 bundle and the tampered bundle.

These are the boundaries PRD §19 suggests. The library and the exporter are TypeScript that Node.js 24 runs directly by stripping the types: there is no build step. That is why imports name their `.ts` files, and why `tsconfig.json` now sets `allowImportingTsExtensions` and the ES2024 library (for `String.prototype.isWellFormed`).

### Two implementations

The verifier shares no code with the library. Its JSON parser, RFC 8785 serializer, JSON Schema validator, Merkle tree and arithmetic are written separately. Tests require the two to agree:
- on the RFC 8785 test data;
- on every golden vector;
- on the acceptance and rejection of each schema case;
- on the register rules;
- on the MR-48 and tampered bundles.

This is the "second implementation" MR-37 asks for, within one build team. It is not a substitute for an outside party reproducing the roots before real publication.

### Canonical bytes (MR-32)

- **Standard.** JSON Canonicalization Scheme, RFC 8785:
  - §3.2.2.2: strings escape only `"`, `\` and U+0000 to U+001F;
  - §3.2.2.3: numbers use the ECMAScript Number-to-String algorithm;
  - §3.2.3: object members are sorted by the UTF-16 code units of their names;
  - §3.2.4: the output is UTF-8.
- **Library side.** The pinned package `canonicalize` 5.1.0 (Apache-2.0, maintained by one of the RFC's authors, no dependencies). It is called only after checking that the value is plain JSON, because the package would otherwise drop or convert `undefined`, functions and `toJSON` objects.
- **Verifier side.** Its own serializer.
- **Testing.** Both pass the test data published with the RFC's reference implementation (`tests/fixtures/rfc8785`). The RFC's own text, with its Appendix B number table, could not be fetched from the build environment. Its absence matters little here: no v1 schema allows a JSON number at all. Amounts, counts and sequences are canonical decimal strings: no plus sign, no leading zero, never `-0`.
- **Strict input.** Both parsers refuse duplicate member names, a byte-order mark, malformed UTF-8, lone surrogates (escaped or not), numbers that overflow to infinity, raw control characters and nesting deeper than 64.
- **No rewriting.** Unicode text is kept exactly as accepted; nothing is normalized after sealing.
- **Canonical files.** Every JSON file in a bundle is stored as its exact canonical bytes. The register is one canonical event per line. The verifier rejects a file that parses correctly but is not byte-canonical.

### Merkle tree (MR-33): `marrs-rover-merkle.1`

    leaf   = SHA256(0x00 || canonical event bytes)
    parent = SHA256(0x01 || left || right)               raw 32-byte digests, never hex text
    root   = SHA256(0x02 || uint64_be(leafCount) || top)

- **Leaf order.** Leaves are taken in event-sequence order. A sequence is assigned at first publication and never reused. The effective date never sets the order.
- **Odd nodes.** When a level has an odd number of nodes, the last one moves up unchanged. Duplicating it instead, as some trees do, would give the lists `[a, b, c]` and `[a, b, c, c]` the same top.
- **Binding the leaf count.** The published root is not the tree's top. It is the top hashed again, under its own domain byte `0x02`, together with the leaf count as an 8-byte big-endian integer. As a result:
  - a tree and any truncated, padded or re-split copy of it never share a root;
  - a root can never be confused with a leaf or an inner node;
  - a verifier needs the count to recompute the root, so the count is bound rather than merely stated.
- **No empty tree.** There is no root without a leaf: a period with no cash activity still carries one reconciliation or scope event saying so.
- **Inclusion paths.** A path lists, from the leaf up, each sibling and whether it sits on the left or the right. A level where the node was promoted has no step. A verifier recomputes the expected shape from the leaf's position and the count, and rejects a path of any other shape. So a proof for one position cannot pass for another.

### Schemas (MR-28 to MR-30)

- **Versioning.** Ten JSON Schemas (draft 2020-12) and a versioned currency-exponent mapping, in `packages/ledger-proof/schemas/v1`. The verifier pins byte-identical copies.
- **Strictness.** Every object is closed (`additionalProperties: false`), so an unknown or private field is a schema failure.
- **Synthetic data.** Synthetic files must carry the MR-5 demo label, and real files must not.
- **Typography of the label.** The label is "Demo data — not VT Infinite's financial records.", with the spaced em dash of brand reference §05 and the public specification. The PRD's text shows a hyphen; changing it is one constant (`DEMO_LABEL`).
- **Rules beyond the schemas.** Some rules a schema cannot express, so the library (`invariants.ts`) and the verifier each enforce them:
  - contiguous sequences;
  - unique IDs;
  - references only to earlier events;
  - leg arithmetic per event type;
  - an exact reversal;
  - a replacement only after a reversal;
  - a reclassification that changes the category alone.
- **Validators.** The library validates with Ajv 8.20.0 (MIT). The verifier uses its own validator, which implements only the keywords v1 uses and refuses a schema with any other.

### The bundle (MR-29 to MR-31)

A bundle is a flat folder with these files:
- `manifest.json`
- `register.jsonl`
- `register.csv`
- `summary.json`
- `scope.json`
- `proofs.json`
- `exceptions.json`
- `corrections.json`
- `budgets.json`
- `approvals.json`
- `schemas.json`
- `verify.md`

How it is sealed:
- The manifest lists every other file with its SHA-256 and size. It never contains its own digest or a chain signature.
- The folder is named for the SHA-256 of the manifest's bytes.
- A sealed folder is never rewritten. An amendment is a new bundle that names the earlier root and the next commitment sequence, and keeps every earlier event byte for byte. The verifier checks this with `--prior`.
- The CSV is a convenience view. A spreadsheet would run some text cells as formulas, so those cells get a leading apostrophe; the canonical register is untouched.

### Arithmetic (MR-17 to MR-19)

- **Basis.** Cash activity only.
- **Exactness.** Integer minor units, in BigInt, never a float.
- **Per currency.** Amounts in different currencies are never added together.

For each currency:

    closing = opening + receipts - disbursements + reversals + internal transfers + boundary transfers

- Internal transfers must net to zero.
- Receipts and disbursements are each split into operating and financing, so a loan receipt is never shown as income.
- Each restricted fund rolls forward the same way. A fund may not be overdrawn, and the funds together may not exceed the cash that holds them, because a restriction is not extra cash.
- The verifier recomputes everything from the full register and the stated openings. It reports arithmetic failures apart from cryptographic ones (MR-35).

### Privacy scan (MR-22 to MR-27)

**What it flags.** It runs on every bundle before sealing, and in CI on the frozen bundle. It fails a bundle containing any of the following:

| Category | Flagged |
| --- | --- |
| Bank details | IBANs (checksum-valid), US routing numbers (checksum-valid), card numbers (Luhn-valid), long digit runs in text, and SWIFT codes |
| Personal details | Personal names (two capitalized words in a row, or an honorific, unless the phrase is an approved label), email addresses, phone numbers, and SSN- and EIN-shaped numbers |
| Individuals' wallets | Solana, Bitcoin and Ethereum addresses, and any native payment in a synthetic bundle |
| Private approvals | Fields named for approvers or signers, and phrases such as "approved by" or "paid to" before a name |
| Salts, keys and secrets | Fields named salt, secret, key, seed or token; long hex or base64 values outside digest fields; and keypair-shaped byte arrays |
| Private configuration | Any name listed in `PRIVATE_IDENTIFIERS` |

**What it is not.** It is a release gate and a prompt for a person's review, not proof of safety: a name it misses is still a leak. It never prints a matched value in full.

### Output (MR-36)

The verifier reports each layer separately:

| Layer | Possible results |
| --- | --- |
| Bundle | valid or invalid |
| Inclusion proofs | valid or invalid |
| Chain commitment | always "not attempted" in this version |
| Balance checks | passed or failed |
| Reconciliation evidence | present or absent, as stated, with the open exceptions listed |
| Independent report | present (with its stated scope) or absent |

There is never a single "verified". The exit status is non-zero if the bundle, the proofs or the balances fail.

### The MR-48 fixture

**Contents.** One synthetic quarter for a fictional entity, "Synthetic Demo Organization (fictional)", in 2000-Q1. The year 2000 was chosen so that it cannot be mistaken for VT Infinite's history. The quarter has:
- 10 receipts, one of them loan proceeds, which are financing;
- 10 disbursements;
- two restricted funds;
- one internal transfer;
- one correction: a disbursement entered at the wrong amount, its exact reversal, then a replacement at the correct amount;
- one reconciliation event.

That makes 24 events in all.

**State.** One exception is open, and there is no independent report. So the fixture shows a valid hash beside an open exception and an absent review, as PRD §23 requires.

## Honest limits (MR-38)

A matching root shows that the bundle you examined matches its manifest, and in a later stage a recorded chain commitment. It shows nothing more than that. In particular, it does not show:
- that the source documents are genuine;
- that every account of the organization is included (the count and register checks find rows missing from the committed bundle, not an account that was never disclosed);
- that amounts are classified correctly;
- that the organization complied with the law;
- that anyone benefited;
- that an accountant has examined the books.

The arithmetic checks show internal consistency only. Each of the claims above needs its own evidence and stated scope. The verifier's output says so every time it runs.

## Not verified, and open

- **Large amounts.** The repository's `long-numeric-id` guard fails any run of 15 or more digits. So the frozen large-amount vector stops at 14 digits (below 2^53), and amounts above 2^53 are tested in code, not frozen. One RFC 8785 test input is stored hex-encoded for the same reason. Freezing larger amounts needs Matthew's approval of a guard exception.
- **The RFC's Appendix B number vectors.** Not included; the RFC text could not be fetched.
- **A third party reproducing the roots.** Not yet done. MR-37 requires it before real publication.
- **Chain work.** Chain commitment, finality, network and program checks (MR-39 to MR-44) belong to stage 7. The verifier's chain result stays "not attempted" until then.
- **Browser verifier.** It follows in a later stage (MR-34).
