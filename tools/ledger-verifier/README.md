# Marrs Rover verifier

A standalone command that checks a Marrs Rover publication bundle without the website. It reads only the files you give it. It makes no network request and needs nothing but Node.js 22 or later: there are no dependencies to install.

It is a separate implementation from the code that builds bundles. Its JSON parser, RFC 8785 canonicalization, schema validator, Merkle tree and balance arithmetic are all written here, in this folder. A fault in one implementation is caught by the other.

Licensed under the Apache License, Version 2.0 (`LICENSE`), the same licence as the vt-infinite repository.

## Usage

From a copy of the vt-infinite repository, or from a copy of this folder alone:

    node tools/ledger-verifier/verify.mjs <bundle folder>

Options:

| Option | What it does |
| --- | --- |
| `--expect <sha256>` | Also require the manifest's SHA-256 to equal a value you got somewhere else, such as a publication receipt or a chain record. |
| `--prior <earlier bundle folder>` | Also check that this bundle continues an earlier one: it names the earlier root and the next commitment sequence, and, for the same period, keeps every earlier event byte for byte. |
| `--json` | Print the results as JSON instead of plain words. |
| `--golden <folder>` | Reproduce the golden vectors (`fixtures/marrs-rover/golden`) with this verifier's own code. |
| `--version` | Print the version. |

Exit status:
- `0`: the bundle, its inclusion proofs and its balance checks all pass.
- `1`: any of them fails.
- `2`: a usage error.
- `3`: the verifier itself could not finish, and nothing was verified.

`verify.mjs` always runs its checks, however it is launched: directly, from a path containing spaces, or through a symbolic link such as an npm `bin` install. It fails closed: the exit status stays 3 until a run finishes and sets its own.

Try it on the synthetic fixtures:

    node tools/ledger-verifier/verify.mjs fixtures/marrs-rover/bundles/demo/2000-Q1/5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5
    node tools/ledger-verifier/verify.mjs fixtures/marrs-rover/tampered/5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5
    node tools/ledger-verifier/verify.mjs --golden fixtures/marrs-rover/golden

The first must pass and the second must fail. Both are synthetic: **Demo data — not VT Infinite's financial records.**

## What it checks

**Bundle**
- `manifest.json` is canonical JSON and valid against the v1 manifest schema.
- The bundle folder's name, when it is a SHA-256, equals the manifest's own SHA-256. So does `--expect`, when given.
- The folder holds exactly the files the manifest lists, each with the listed SHA-256 and size.
- Every JSON file is in RFC 8785 canonical form and valid against its pinned v1 schema. Strict parsing refuses duplicate keys, malformed UTF-8, lone surrogates and non-finite numbers.
- Every document names the same entity, period, environment and demo label.
- The schemas and currency mapping inside the bundle are the published v1 set, compared with this folder's own copies in `schemas/v1`.
- The register is one canonical, schema-valid event per line. The rules for each line are:
  - Event IDs are unique, and sequences run 1, 2, 3 … in order.
  - Every effective date is a real date inside the period, and every currency is in the mapping.
  - Every leg is in an in-scope bucket of its own currency.
  - Receipts, disbursements and transfers have the legs their amounts imply.
  - A reversal exactly mirrors its original, a replacement comes after a reversal, and a reclassification changes the category only.
  - Every correction points to an earlier event.
- The event count, and the Merkle root computed from the register, match the manifest. The corrections file matches the register.

**Inclusion proofs**
- There is one proof per event. Each leads from the event's own bytes to the manifest's root, along a path whose shape is exactly the one its position implies.

**Balance checks**
- From the full register and the stated opening balances, it recomputes, for each currency, the opening, receipts, disbursements, reversals, transfers and closing.
- It also recomputes each bucket and each restricted fund, and the counts of each event type.
- Internal transfers must net to zero. Restricted funds must never be overdrawn or larger than the cash that holds them.
- Different currencies are never added together.

**Reconciliation evidence and independent report**
- Reported exactly as the bundle states them, with the open exceptions listed. The verifier never upgrades them.

**Chain commitment**
- Always `NOT ATTEMPTED` in this version. It reads only the downloaded files.

## Output

Each layer is reported on its own line, as `VALID` or `INVALID`, `PASSED` or `FAILED`, `PRESENT` or `ABSENT`, and `NOT ATTEMPTED` for the chain. A step that could not run says `NOT CHECKED` and why; for example, a `proofs.json` that fails its schema means no inclusion proof is checked. There is no single "verified".

The last line says which publication was checked. Without `--expect`, the result shows internal consistency only: these files agree with each other, but nothing ties them to the publication you meant to check. Give the manifest SHA-256 from a publication receipt with `--expect` to tie them.

This is the actual output for the synthetic MR-48 bundle:

```
Marrs Rover verifier 1.0.0
Folder: fixtures/marrs-rover/bundles/demo/2000-Q1/5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5
Environment: Synthetic demo. Demo data — not VT Infinite's financial records.
Entity: demo   Period: 2000-Q1   Events: 24
Manifest SHA-256: 5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5
Published root:   c0de954323d3f888a9e59b561337a9caecc555d952096d16ec2ddaa7143312dd

Bundle: VALID - every file matches the manifest; the 24 events are canonical, schema-valid and in order, and they give the published root.
Inclusion proofs: VALID - 24 of 24 events lead from their own bytes to the published root.
Chain commitment: NOT ATTEMPTED - no chain check is made; this verifier version reads only the downloaded files.
Balance checks: PASSED - every summary total, bucket and restricted fund recomputes exactly from the full register.
Reconciliation evidence: PRESENT - the scope statement says partially reconciled on 2000-04-03; 1 reconciliation event(s) in the register. Synthetic: operating cash matched to a synthetic bank statement through 2000-03-31; reserve cash not matched (exception syn-exc-001).
    Open exceptions: 1
    - syn-exc-001 (unreconciled-item): Synthetic exception: the 2000-03-10 transfer into reserve cash has not been matched to a synthetic bank statement.
Independent report: ABSENT - the bundle includes no independent examination.
Which publication: NOT CHECKED - no outside manifest SHA-256 was given (--expect), so this result shows internal consistency only, not which publication this is.

What this does and does not show: a valid bundle and proofs mean these files match this manifest and its root. They do not show that the source records are genuine, that every account is included, that amounts are classified correctly, or that any audit took place.

Result: the bundle, its proofs and its arithmetic check out (exit 0).
```

## What a pass does not show

A matching root shows that the bundle you examined matches its manifest, and, once chain checks exist, a recorded commitment. It does not show that the source documents are genuine, that every account is included, that amounts are classified correctly, that the organization complied with the law, or that any accountant has examined the books. Those claims need their own evidence, with its scope stated.

## Files

- `verify.mjs`: the command. It only calls `lib/cli.mjs` and sets the exit status.
- `lib/cli.mjs`: argument handling and the plain-words report.
- `lib/json.mjs`: strict JSON parsing and RFC 8785 canonical serialization.
- `lib/schema.mjs`: a validator for exactly the JSON Schema keywords the v1 schemas use. It refuses any other keyword.
- `lib/merkle.mjs`: the `marrs-rover-merkle.1` tree and proof checks.
- `lib/checks.mjs`: the bundle, register, balance and continuity checks.
- `lib/golden.mjs`: reproduces the golden vectors.
- `schemas/v1/`: pinned copies of the published v1 schemas and currency mapping. A test keeps them byte-identical to `packages/ledger-proof/schemas/v1`.

The proof format is described in `docs/adr/0005-marrs-rover-proof-format.md`.
