#!/usr/bin/env node
// Prints a hashed-phrases.json entry for a phrase read from stdin, so the
// phrase itself never needs to be committed.
// Usage: printf '%s' 'the phrase' | node scripts/hash-phrase.mjs private|retired
import { phraseEntry } from "../guards/normalise.mjs";

const category = process.argv[2];
if (category !== "private" && category !== "retired") {
  console.error("usage: node scripts/hash-phrase.mjs private|retired < phrase");
  process.exit(2);
}
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
console.log(JSON.stringify(phraseEntry(input.trim(), category)));
