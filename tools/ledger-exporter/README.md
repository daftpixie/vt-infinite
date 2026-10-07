# Marrs Rover exporter

Projects private double-entry books into a sealed public bundle (PRD MR-15 to MR-21 and MR-29 to MR-31).

**The only books here are synthetic. Demo data — not VT Infinite's financial records.**

    node tools/ledger-exporter/export.ts --books <books.json> --ids <allocations.json> --out <folder> [--allocate]

1. **Check the books.** It reads the journal and checks that every entry's debits equal its credits in one currency, and that every account is known. A reversal must mirror its original exactly.
2. **Project to public events.**
   - A cash account becomes a public bucket ID. Every other account becomes a versioned public category and a flow: operating, or financing for a loan.
   - Source entry IDs, account numbers and account names stay private.
   - Each entry's public UUID and sequence come from the allocation registry (`--ids`), assigned once and never reused.
   - `--allocate` gives new entries a random UUID and the next sequence, and writes the registry back.
3. **Seal.** It checks every schema, register rule and balance, computes the summary from the full register, and builds the inclusion proofs and the manifest.
4. **Privacy scan.** Any finding stops the export, and nothing is written.
5. **Write.** The bundle goes to `<folder>/<entityId>/<periodId>/<manifest SHA-256>/`. A sealed folder is never rewritten: the same bytes are a no-op, and different bytes are refused.

The synthetic MR-48 books are `demo/books.synthetic.json`, and their allocations are `demo/public-ids.synthetic.json`. They are committed because they are synthetic; real books and allocations never enter this repository (MR-22). This is how the frozen fixture is made:

    node tools/ledger-exporter/export.ts --books tools/ledger-exporter/demo/books.synthetic.json --ids tools/ledger-exporter/demo/public-ids.synthetic.json --out fixtures/marrs-rover/bundles

`golden.ts` writes the golden vectors:

    node tools/ledger-exporter/golden.ts --out fixtures/marrs-rover/golden

Both outputs are deterministic. `tests/unit/ledger-golden.test.ts` and `tests/unit/ledger-books.test.ts` regenerate them and require identical bytes.
