# ledger-proof

The Marrs Rover proof library: the versioned public schemas, strict JSON input, RFC 8785 canonical bytes, the `marrs-rover-merkle.1` tree, the register rules, exact balance arithmetic, the bundle sealer and the release privacy scan. The exporter (`tools/ledger-exporter`) uses it. The standalone verifier (`tools/ledger-verifier`) deliberately does not: it is a second implementation.

**Everything this library has produced so far is synthetic. Demo data — not VT Infinite's financial records.**

| File | What it does | PRD |
| --- | --- | --- |
| `schemas/v1/*.schema.json` | JSON Schemas (draft 2020-12) for the event, period summary, scope statement, manifest, proofs, exceptions, corrections, budgets, approvals and schema set. Every object is closed; no schema allows a JSON number. | MR-28 to MR-30 |
| `schemas/v1/currencies.json` | The versioned currency-exponent mapping. A currency not listed is rejected. | MR-19 |
| `src/strict-json.ts` | Parses JSON while refusing duplicate keys, a byte-order mark, malformed UTF-8, lone surrogates, non-finite numbers and deep nesting. | MR-32 |
| `src/canonical.ts` | RFC 8785 bytes, through the pinned `canonicalize` package, after checking that the value is plain JSON. | MR-32 |
| `src/merkle.ts` | Leaves, parents, the count-bound root, inclusion paths and their verification. | MR-33 |
| `src/invariants.ts` | Register rules a schema cannot express: sequence, uniqueness, references, leg arithmetic per event type, corrections. | MR-18, MR-21, MR-28 |
| `src/arithmetic.ts` | Exact BigInt totals per currency, bucket and restricted fund, and the balance checks. | MR-17 to MR-19 |
| `src/bundle.ts` | Seals a bundle: every file and digest, the proofs and the manifest. | MR-29 to MR-31 |
| `src/privacy.ts` | The release privacy scan. | MR-22 to MR-27 |

The design and its limits are in `docs/adr/0005-marrs-rover-proof-format.md`. The source runs directly on Node.js 24, which strips the TypeScript types, so there is no build step.
