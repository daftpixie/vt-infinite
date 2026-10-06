// This file holds deliberate violations to prove each guard fires. The
// repository scan skips it for that reason (scripts/guard.mjs, SKIP).
import { describe, expect, it } from "vitest";
import { phraseEntry } from "@/guards/normalise.mjs";
import { CRISIS_TEXT, HASHED_PHRASES, matchHashed, runRules } from "@/guards/rules.mjs";

const rules = (text: string, scopes: Array<"repo" | "copy"> = ["repo", "copy"], env = {}) =>
  [...new Set(runRules(text, { target: "test", scopes, env }).map((f) => f.rule))];

describe("repo guards fire", () => {
  it.each([
    ["byline", "Essay by Matthew J. Adams"],
    ["marrs-spelling", "Explore the Mars Rover explorer"],
    ["marrs-spelling", "Marr's Rover"],
    ["marrs-spelling", "see /mars-rover"],
    ["marrs-attribution", "Jonathan Marrs"],
    ["pbc-status", "VT Infinite, PBC"],
    ["pbc-status", "VT Infinite, Inc. is a Delaware public benefit corporation."],
    ["initiative-pairing", "MIRmade … OneRhythm"],
    ["long-numeric-id", "project 1209876543210987"],
    ["secrets", "-----BEGIN PRIVATE KEY-----"],
    ["secrets", `[${Array.from({ length: 64 }, (_, i) => i).join(",")}]`],
    ["secrets", "ghp_" + "a".repeat(36)],
  ])("%s: %s", (rule, text) => {
    expect(rules(text, ["repo"])).toContain(rule);
  });

  it("reads extra private identifiers from the environment", () => {
    expect(rules("id abcd-secret-name here", ["repo"], { PRIVATE_IDENTIFIERS: "abcd-secret-name" })).toContain("private-env-identifiers");
  });
});

describe("hashed phrases", () => {
  // Synthetic phrases only: the real list is stored as hashes so that no
  // private identifier or retired line is ever written into this repository.
  const entries = [phraseEntry("Synthetic Private Name", "private"), phraseEntry("a synthetic retired line", "retired")];

  it("matches across punctuation and case", () => {
    expect(matchHashed("see synthetic-private_name here", entries)).toHaveLength(1);
    expect(matchHashed("A Synthetic, retired LINE.", entries)).toHaveLength(1);
  });
  it("ignores near misses", () => {
    expect(matchHashed("synthetic private names", entries)).toEqual([]);
  });
  it("ships a well-formed list with both categories", () => {
    expect(HASHED_PHRASES.length).toBeGreaterThan(0);
    for (const h of HASHED_PHRASES) {
      expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(h.words).toBeGreaterThan(0);
    }
    expect(new Set(HASHED_PHRASES.map((h) => h.category))).toEqual(new Set(["private", "retired"]));
  });
});

describe("copy guards fire", () => {
  it.each([
    ["brand-words", "Make a donation today"],
    ["brand-words", "A cure for arrhythmia"],
    ["brand-words", "Our users love it"],
    ["brand-words", "The record is immutable"],
    ["brand-words", "Buy the token"],
    ["brand-names", "VTI builds tools"],
    ["brand-names", "One Rhythm"],
    ["pbc-mention", "We plan to become a PBC"],
    ["clinical-function", "OneRhythm … detect"],
    ["funding-ask", "Fund our work"],
    ["crisis-block", "This essay discusses suicide."],
  ])("%s: %s", (rule, text) => {
    expect(rules(text, ["copy"])).toContain(rule);
  });
});

describe("guards stay quiet on correct copy", () => {
  it.each([
    "Matthew J Adams",
    "Marrs Rover Block Explorer",
    "/marrs-rover/method",
    "VT Infinite, Inc.",
    "OneRhythm is an initiative of VT Infinite, Inc.",
    "We build roofs, not empires.",
    `This essay discusses suicide. ${CRISIS_TEXT}`,
    "VT Infinite",
  ])("%s", (text) => {
    expect(rules(text)).toEqual([]);
  });
});
