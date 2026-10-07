**Demo data — not VT Infinite's financial records.**

# Verifying this bundle

This folder is one sealed Marrs Rover publication. Its folder name is the SHA-256 of `manifest.json`. The manifest lists every other file with its SHA-256 and size.

To check it without the website, run the standalone verifier from the vt-infinite repository (`tools/ledger-verifier`, Node.js 22 or later, no dependencies):

    node tools/ledger-verifier/verify.mjs <path to this folder>

It reports each result separately: the bundle, the inclusion proofs, the chain commitment, the balance checks, reconciliation evidence and any independent report.

What a passing result means: the files match the manifest, every event is included under the published root, and the totals add up. It does not show that the source records are genuine, that every account is included, that amounts are classified correctly, or that anyone has audited them.
