#!/usr/bin/env node
/**
 * Release privacy scan for a Marrs Rover bundle folder (PRD MR-22 to MR-27).
 *
 *   node scripts/ledger-privacy-scan.ts <bundle folder> [...more folders]
 *
 * Fails (exit 1) on any finding. Nothing in the bundle, its entity label
 * included, is treated as an approved phrase; the only exemptions are the
 * reviewed APPROVED_PHRASES in the scan itself. Names to keep out can be
 * supplied in PRIVATE_IDENTIFIERS (comma-separated; never committed).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanBundle } from "../packages/ledger-proof/src/privacy.ts";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: node scripts/ledger-privacy-scan.ts <bundle folder> [...]");
  process.exit(2);
}
const privateIdentifiers = (process.env.PRIVATE_IDENTIFIERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
let failed = false;
for (const dir of dirs) {
  const files = new Map(readdirSync(dir).map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const findings = scanBundle(files, { privateIdentifiers });
  if (findings.length) {
    failed = true;
    console.log(`privacy scan: ${dir}: ${findings.length} finding(s)`);
    for (const f of findings) console.log(`- ${f.rule} in ${f.file} at ${f.at}: ${f.message} (${f.excerpt})`);
  } else {
    console.log(`privacy scan: ${dir}: no findings in ${files.size} files${privateIdentifiers.length ? "" : " (PRIVATE_IDENTIFIERS not set; private names not checked)"}`);
  }
}
process.exit(failed ? 1 : 0);
