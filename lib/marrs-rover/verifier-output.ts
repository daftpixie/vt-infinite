/**
 * What the CLI verifier (tools/ledger-verifier) prints for the demo
 * publication, run from the folder that holds the downloaded bundle:
 *
 *   node <verifier folder>/verify.mjs <digest> --expect <digest>
 *
 * The Verify page shows it as the expected output. A unit test runs the
 * real verifier on the sealed fixture and requires this text exactly, so
 * the page cannot drift from what the tool says.
 */
export const EXPECTED_VERIFIER_RUN = {
  digest: "5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5",
  exitCode: 0,
  output: "Marrs Rover verifier 1.0.0\nFolder: 5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5\nEnvironment: Synthetic demo. Demo data — not VT Infinite's financial records.\nEntity: demo   Period: 2000-Q1   Events: 24\nManifest SHA-256: 5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5\nPublished root:   c0de954323d3f888a9e59b561337a9caecc555d952096d16ec2ddaa7143312dd\n\nBundle: VALID - every file matches the manifest; the 24 events are canonical, schema-valid and in order, and they give the published root.\nInclusion proofs: VALID - 24 of 24 events lead from their own bytes to the published root.\nChain commitment: NOT ATTEMPTED - no chain check is made; this verifier version reads only the downloaded files.\nBalance checks: PASSED - every summary total, bucket and restricted fund recomputes exactly from the full register.\nReconciliation evidence: PRESENT - the scope statement says partially reconciled on 2000-04-03; 1 reconciliation event(s) in the register. Synthetic: operating cash matched to a synthetic bank statement through 2000-03-31; reserve cash not matched (exception syn-exc-001).\n    Open exceptions: 1\n    - syn-exc-001 (unreconciled-item): Synthetic exception: the 2000-03-10 transfer into reserve cash has not been matched to a synthetic bank statement.\nIndependent report: ABSENT - the bundle includes no independent examination.\nWhich publication: MATCHED - the manifest SHA-256 equals the value given with --expect.\n\nWhat this does and does not show: a valid bundle and proofs mean these files match this manifest and its root. They do not show that the source records are genuine, that every account is included, that amounts are classified correctly, or that any audit took place.\n\nResult: the bundle, its proofs and its arithmetic check out (exit 0).\n",
} as const;
