#!/usr/bin/env node
// Marrs Rover release checks (PRD MR-27, MR-34, MR-37, R5), run in CI.
// Prints each tool's own output, then fails unless:
//   - the privacy scan finds nothing in the synthetic bundle,
//   - the standalone verifier accepts the MR-48 bundle,
//   - the standalone verifier rejects the tampered bundle,
//   - the standalone verifier reproduces every golden vector.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const BUNDLES = "fixtures/marrs-rover/bundles/demo/2000-Q1";
const bundles = readdirSync(BUNDLES).map((d) => join(BUNDLES, d));
const tampered = readdirSync("fixtures/marrs-rover/tampered").map((d) => join("fixtures/marrs-rover/tampered", d));

const steps = [
  ["privacy scan of the synthetic bundle", ["scripts/ledger-privacy-scan.ts", ...bundles], 0],
  ...bundles.map((b) => [`verifier accepts ${b}`, ["tools/ledger-verifier/verify.mjs", b], 0]),
  ...tampered.map((b) => [`verifier rejects ${b}`, ["tools/ledger-verifier/verify.mjs", b], 1]),
  ["verifier reproduces the golden vectors", ["tools/ledger-verifier/verify.mjs", "--golden", "fixtures/marrs-rover/golden"], 0],
];

let failed = 0;
for (const [name, args, want] of steps) {
  console.log(`\n=== ${name} (expect exit ${want})`);
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  const ok = r.status === want;
  console.log(`=== ${ok ? "ok" : "FAILED"}: exit ${r.status}`);
  if (!ok) failed++;
}
console.log(failed ? `\nledger release check: ${failed} step(s) failed.` : "\nledger release check: all steps as expected.");
process.exit(failed ? 1 : 0);
