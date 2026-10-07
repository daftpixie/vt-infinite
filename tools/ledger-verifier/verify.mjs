#!/usr/bin/env node
// Marrs Rover bundle verifier. See README.md.
//
//   node verify.mjs <bundle folder> [--expect <manifest sha256>] [--prior <earlier bundle folder>] [--json]
//   node verify.mjs --golden <golden vectors folder>
//
// Exit status: 0 when the bundle, its inclusion proofs and its balance
// checks all pass; 1 when any of them fails; 2 for a usage error; 3 when
// the verifier itself could not finish.
//
// This file is only an entry point, and it runs unconditionally: there is
// no "am I the main module?" test that a symlink (an npm bin install), a
// space in the path or another launcher could get wrong, leaving the
// process to exit 0 without checking anything. It also fails closed: the
// exit status is 3 until main() returns a valid status of its own.
import { main } from "./lib/cli.mjs";

process.exitCode = 3;
try {
  const code = main(process.argv);
  process.exitCode = code === 0 || code === 1 || code === 2 ? code : 3;
} catch (err) {
  console.error(`verifier error: the verifier could not finish (${err instanceof Error ? err.message : String(err)}). Nothing was verified.`);
  process.exitCode = 3;
}
