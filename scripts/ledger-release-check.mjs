#!/usr/bin/env node
// Marrs Rover release checks (PRD MR-27, MR-34, MR-37, R5), run in CI.
// Prints each tool's own output, then fails unless:
//   - the privacy scan finds nothing in the synthetic bundle,
//   - the standalone verifier accepts the MR-48 bundle,
//   - the standalone verifier rejects the tampered bundle, reporting every
//     failure listed in fixtures/marrs-rover/tampered.expected.json,
//   - the standalone verifier reproduces every golden vector.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BUNDLES = "fixtures/marrs-rover/bundles/demo/2000-Q1";
const bundles = readdirSync(BUNDLES).map((d) => join(BUNDLES, d));
const tampered = readdirSync("fixtures/marrs-rover/tampered").map((d) => join("fixtures/marrs-rover/tampered", d));

/** What the tampered bundle must be rejected for, not just that it is. */
const expected = JSON.parse(readFileSync("fixtures/marrs-rover/tampered.expected.json", "utf8"));
const tamperedMustSay = [
  "Bundle: INVALID",
  "Inclusion proofs: INVALID",
  "Chain commitment: NOT ATTEMPTED",
  "Balance checks: FAILED",
  ...expected.mustReport,
];

const steps = [
  ["privacy scan of the synthetic bundle", ["scripts/ledger-privacy-scan.ts", ...bundles], 0, ["no findings"]],
  ...bundles.map((b) => [`verifier accepts ${b}`, ["tools/ledger-verifier/verify.mjs", b], 0, ["Bundle: VALID", "Inclusion proofs: VALID", "Balance checks: PASSED"]]),
  ...tampered.map((b) => [`verifier rejects ${b}`, ["tools/ledger-verifier/verify.mjs", b], expected.exitCode, tamperedMustSay]),
  ["verifier reproduces the golden vectors", ["tools/ledger-verifier/verify.mjs", "--golden", "fixtures/marrs-rover/golden"], 0, ["golden vectors reproduced"]],
];

let failed = 0;
for (const [name, args, want, mustSay] of steps) {
  console.log(`\n=== ${name} (expect exit ${want})`);
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  const missing = mustSay.filter((m) => !(r.stdout ?? "").includes(m));
  const ok = r.status === want && missing.length === 0;
  for (const m of missing) console.log(`=== missing from the output: ${m}`);
  console.log(`=== ${ok ? "ok" : "FAILED"}: exit ${r.status}${missing.length ? `, ${missing.length} expected line(s) missing` : ""}`);
  if (!ok) failed++;
}
console.log(failed ? `\nledger release check: ${failed} step(s) failed.` : "\nledger release check: all steps as expected.");
process.exit(failed ? 1 : 0);
