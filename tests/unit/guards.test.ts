// This file holds deliberate violations to prove each guard fires. The
// repository scan skips it for that reason (scripts/guard.mjs, SKIP).
import { describe, expect, it } from "vitest";
import { phraseEntry } from "@/guards/normalise.mjs";
import { CRISIS_TEXT, HASHED_PHRASES, containsSequence, matchHashed, privateIdentifiers, runRules } from "@/guards/rules.mjs";

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
  // Synthetic phrases only, so no retired line is written into this repository.
  const entries = [phraseEntry("Synthetic Retired Name", "retired"), phraseEntry("a synthetic retired line", "retired")];

  it("matches across punctuation and case", () => {
    expect(matchHashed("see synthetic-retired_name here", entries)).toHaveLength(1);
    expect(matchHashed("A Synthetic, retired LINE.", entries)).toHaveLength(1);
  });
  it("ignores near misses", () => {
    expect(matchHashed("synthetic retired names", entries)).toEqual([]);
  });
  it("ships retired legacy copy only, never private identifiers", () => {
    expect(HASHED_PHRASES.length).toBeGreaterThan(0);
    for (const h of HASHED_PHRASES) {
      expect(h.category).toBe("retired");
      expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(h.words).toBeGreaterThan(0);
    }
  });
});

describe("PRIVATE_IDENTIFIERS matching", () => {
  // Synthetic values only.
  const env = { PRIVATE_IDENTIFIERS: "Synthetic-Project Name, 1234567890123456 ,zz" };
  const hit = (text: string) => rules(text, ["repo"], env).includes("private-env-identifiers");

  it.each([
    "synthetic-project name",
    "SYNTHETIC_PROJECT_NAME",
    "the synthetic project name, again",
    "Synthetic.Project/Name",
    "id: 1234567890123456.",
  ])("finds %j", (text) => {
    expect(hit(text)).toBe(true);
  });

  it.each(["synthetic projects name", "asynthetic project name", "synthetic project", "12345678901234567", "zz top"])(
    "does not match partial words or too-short values: %j",
    (text) => {
      expect(hit(text)).toBe(false);
    },
  );

  it("splits on commas and normalises each value", () => {
    expect(privateIdentifiers(env)).toEqual([["synthetic", "project", "name"], ["1234567890123456"]]);
    expect(privateIdentifiers({})).toEqual([]);
    expect(privateIdentifiers({ PRIVATE_IDENTIFIERS: " , ," })).toEqual([]);
  });

  it("never echoes a value in a finding", () => {
    const findings = runRules("SYNTHETIC_PROJECT_NAME", { target: "t", scopes: ["repo"], env });
    expect(JSON.stringify(findings)).not.toMatch(/synthetic/i);
  });

  it("matches whole-word sequences only", () => {
    expect(containsSequence(["a", "b", "c"], ["b", "c"])).toBe(true);
    expect(containsSequence(["a", "b", "c"], ["a", "c"])).toBe(false);
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
