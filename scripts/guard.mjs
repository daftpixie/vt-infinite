#!/usr/bin/env node
// Runs the copy, claim and secret guards over the repository: every tracked
// file plus untracked files that are not ignored, so the pre-commit hook
// sees new files too. Rendered pages are checked by the end-to-end suite.
//
// Usage: node scripts/guard.mjs [--staged]
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { runRules } from "../guards/rules.mjs";

/** Files that define or test the guards themselves contain the patterns on purpose. */
const SKIP = [/^guards\//, /^tests\/unit\/guards\.test\.ts$/, /^package-lock\.json$/];
const BINARY = /\.(?:woff2?|ttf|otf|png|jpe?g|gif|webp|avif|ico|pdf|zip|gz)$/i;

/** Paths that must never be committed (kickoff hard rules). */
const FORBIDDEN_PATHS = [
  [/(^|\/)\.env(\.|$)(?!example$)/, "environment file"],
  [/(^|\/)[^/]*-?keypair\.json$/i, "keypair file"],
  [/(^|\/)id\.json$/, "possible Solana keypair"],
  [/(^|\/)target\//, "build output (target/)"],
  [/(^|\/)\.config\/solana\//, "Solana CLI configuration"],
  [/\.(?:pem|key|p12|pfx)$/i, "key material"],
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

export function listFiles({ staged = false } = {}) {
  if (staged) return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  return [...new Set([...git(["ls-files"]), ...git(["ls-files", "--others", "--exclude-standard"])])];
}

export function scan(files, env = process.env) {
  const findings = [];
  for (const file of files) {
    for (const [re, what] of FORBIDDEN_PATHS) {
      if (re.test(file)) findings.push({ rule: "forbidden-path", target: file, match: file, message: `Never commit ${what}.` });
    }
    // File names are scanned too: a retired asset name is a finding.
    findings.push(...runRules(file, { target: `${file} (path)`, scopes: ["repo"], env }).filter((f) => f.rule === "hashed-phrases"));
    if (SKIP.some((re) => re.test(file)) || BINARY.test(file)) continue;
    let text;
    try {
      if (!statSync(file).isFile()) continue;
      text = readFileSync(file, "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    const scopes = file.startsWith("content/") ? ["repo", "copy"] : ["repo"];
    findings.push(...runRules(text, { target: file, scopes, env }));
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = listFiles({ staged: process.argv.includes("--staged") });
  const findings = scan(files);
  if (findings.length === 0) {
    console.log(`guard: ${files.length} files checked, no findings.`);
  } else {
    for (const f of findings) console.error(`guard: ${f.target}: [${f.rule}] ${f.message} (${f.match})`);
    console.error(`guard: ${findings.length} finding(s) in ${files.length} files.`);
    process.exit(1);
  }
}
