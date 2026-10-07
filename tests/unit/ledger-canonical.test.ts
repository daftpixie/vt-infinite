import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertPlainJson, canonicalBytes, canonicalString, isCanonical } from "@/packages/ledger-proof/src/canonical.ts";
import { MAX_DEPTH, parseStrictJson, StrictJsonError } from "@/packages/ledger-proof/src/strict-json.ts";
import * as vjson from "@/tools/ledger-verifier/lib/json.mjs";

// RFC 8785 test data from the RFC authors' reference implementation (tests/fixtures/rfc8785/README.md).
const RFC = "tests/fixtures/rfc8785";
const names = readdirSync(join(RFC, "input")).map((f) => f.replace(/\.json(?:\.hex)?$/, ""));
/** One input is stored hex-encoded (see the README); every other input is the file as published. */
const input = (name: string): Buffer => {
  const hex = join(RFC, "input", `${name}.json.hex`);
  return existsSync(hex) ? Buffer.from(readFileSync(hex, "utf8").trim(), "hex") : readFileSync(join(RFC, "input", `${name}.json`));
};
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

describe("RFC 8785 test data (MR-32)", () => {
  it("has all six published cases", () => {
    expect(names.sort()).toEqual(["arrays", "french", "structures", "unicode", "values", "weird"]);
  });

  it.each(names)("library canonicalizer reproduces %s byte for byte", (name) => {
    const expected = readFileSync(join(RFC, "output", `${name}.json`));
    const out = canonicalBytes(parseStrictJson(new Uint8Array(input(name))));
    expect(Buffer.from(out).equals(expected)).toBe(true);
    const hex = readFileSync(join(RFC, "outhex", `${name}.txt`), "utf8").replace(/\s+/g, "").toLowerCase();
    expect(Buffer.from(out).toString("hex")).toBe(hex);
  });

  it.each(names)("verifier canonicalizer reproduces %s byte for byte", (name) => {
    const expected = readFileSync(join(RFC, "output", `${name}.json`));
    expect(Buffer.from(vjson.canonicalBytes(vjson.parseJsonBytes(input(name)))).equals(expected)).toBe(true);
  });

  it("both treat the canonical output as canonical, and the pretty input as not", () => {
    for (const name of names) {
      const out = new Uint8Array(readFileSync(join(RFC, "output", `${name}.json`)));
      expect(isCanonical(out)).toBe(true);
      expect(vjson.isCanonicalBytes(out)).toBe(true);
    }
    const pretty = new Uint8Array(input("structures"));
    expect(isCanonical(pretty)).toBe(false);
    expect(vjson.isCanonicalBytes(pretty)).toBe(false);
  });

  it("sorts keys by UTF-16 code units, not code points (§3.2.3)", () => {
    // U+FB33 sorts after U+1F600 in UTF-16 (0xFB33 > 0xD83D), though not by code point.
    const o = { "\u{1F600}": 1, "דּ": 2, a: 3 };
    expect(canonicalString(o)).toBe('{"a":3,"\u{1F600}":1,"דּ":2}');
    expect(vjson.canonicalize(o)).toBe(canonicalString(o));
  });

  it("escapes control characters as lowercase \\u00xx and nothing else (§3.2.2.2)", () => {
    const s = "\u0000\u001f\u007f/ é\b\t\n\f\r\"\\";
    const expected = '"\\u0000\\u001f\u007f/ é\\b\\t\\n\\f\\r\\"\\\\"';
    expect(canonicalString(s)).toBe(expected);
    expect(vjson.canonicalize(s)).toBe(expected);
  });
});

describe("strict input (MR-32): both parsers reject the same hostile input", () => {
  const verifierParse = (s: string | Uint8Array) => vjson.parseJsonBytes(typeof s === "string" ? bytes(s) : s);
  const libParse = (s: string | Uint8Array) => parseStrictJson(typeof s === "string" ? bytes(s) : s);

  it.each([
    ["duplicate key", '{"a":1,"a":2}'],
    ["duplicate key after an escape", '{"a":1,"\\u0061":2}'],
    ["nested duplicate key", '{"x":{"b":1,"b":1}}'],
    ["lone high surrogate escape", '"\\ud800"'],
    ["lone low surrogate escape", '"\\udc00x"'],
    ["number overflowing to Infinity", "1e400"],
    ["negative overflow", "[-1e400]"],
    ["NaN literal", "NaN"],
    ["Infinity literal", "Infinity"],
    ["leading zero", "012"],
    ["plus sign", "+1"],
    ["trailing comma", "[1,]"],
    ["trailing characters", '{"a":1} x'],
    ["single quotes", "{'a':1}"],
    ["raw control character in a string", '"a\u0001b"'],
    ["bad escape", '"\\x41"'],
    ["unterminated string", '"abc'],
    ["comment", "// note\n{}"],
  ])("%s", (_, input) => {
    expect(() => libParse(input)).toThrow(StrictJsonError);
    expect(() => verifierParse(input)).toThrow(vjson.JsonError);
  });

  it("malformed UTF-8 and a byte-order mark", () => {
    for (const b of [Uint8Array.of(0x22, 0xc3, 0x28, 0x22), Uint8Array.of(0x22, 0xed, 0xa0, 0x80, 0x22), Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d)]) {
      expect(() => libParse(b)).toThrow(StrictJsonError);
      expect(() => verifierParse(b)).toThrow(vjson.JsonError);
    }
  });

  it("nesting deeper than the limit", () => {
    const deep = `${"[".repeat(MAX_DEPTH + 2)}${"]".repeat(MAX_DEPTH + 2)}`;
    expect(() => libParse(deep)).toThrow(/nesting/);
    expect(() => verifierParse(deep)).toThrow(/nested/);
    const ok = `${"[".repeat(MAX_DEPTH)}${"]".repeat(MAX_DEPTH)}`;
    expect(() => libParse(ok)).not.toThrow();
    expect(() => verifierParse(ok)).not.toThrow();
  });

  it("keeps __proto__ as an ordinary key and still catches it duplicated", () => {
    const v = libParse('{"__proto__":{"x":1}}') as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect((verifierParse('{"__proto__":1}') as Record<string, unknown>)["__proto__"]).toBe(1);
    expect(() => libParse('{"__proto__":1,"__proto__":2}')).toThrow(/duplicate/);
    expect(() => verifierParse('{"__proto__":1,"__proto__":2}')).toThrow(/duplicate/);
  });

  it("accepts a properly paired surrogate escape", () => {
    expect(libParse('"\\ud83d\\ude00"')).toBe("\u{1F600}");
    expect(verifierParse('"\\ud83d\\ude00"')).toBe("\u{1F600}");
  });
});

describe("only plain JSON is canonicalized", () => {
  it.each([
    ["undefined member", { a: undefined }],
    ["function", { a: () => 1 }],
    ["NaN", { a: Number.NaN }],
    ["Infinity", [Infinity]],
    ["Date", { a: new Date(0) }],
    ["object with toJSON", { a: { toJSON: () => "x" } }],
    ["lone surrogate", { a: "\ud800" }],
    ["bigint", { a: 1n }],
  ])("refuses %s", (_, v) => {
    expect(() => assertPlainJson(v)).toThrow(TypeError);
    expect(() => canonicalBytes(v)).toThrow();
  });
});
