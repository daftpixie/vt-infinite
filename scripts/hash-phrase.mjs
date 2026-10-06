#!/usr/bin/env node
// Prints a hashed-phrases.json entry for a retired legacy phrase read from
// stdin. Only for copy that was already public: a short unsalted hash of a
// guessable private value can be confirmed by guessing, so private
// identifiers go in the PRIVATE_IDENTIFIERS secret instead, never here.
// Usage: printf '%s' 'the phrase' | node scripts/hash-phrase.mjs retired
import { phraseEntry } from "../guards/normalise.mjs";

const category = process.argv[2];
if (category !== "retired") {
  console.error("usage: node scripts/hash-phrase.mjs retired < phrase");
  process.exit(2);
}
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
console.log(JSON.stringify(phraseEntry(input.trim(), category)));
