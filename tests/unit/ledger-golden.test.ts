import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_LABEL } from "@/packages/ledger-proof/src/constants.ts";
import { goldenFiles } from "@/tools/ledger-exporter/golden.ts";
import { checkGolden } from "@/tools/ledger-verifier/lib/golden.mjs";
import { readJson } from "./ledger-helpers";

const ROOT = "fixtures/marrs-rover";
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

describe("frozen fixtures (MR-37)", () => {
  it("every byte matches SHA256SUMS, and SHA256SUMS lists every file", () => {
    const listed = new Map(
      readFileSync(join(ROOT, "SHA256SUMS"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [sum, path] = l.split(/ {2}/) as [string, string];
          return [path.replace(/^\.\//, ""), sum];
        }),
    );
    const files = walk(ROOT)
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== "SHA256SUMS")
      .sort();
    expect([...listed.keys()].sort()).toEqual(files);
    for (const f of files) expect(createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex"), f).toBe(listed.get(f));
  });

  it("regenerating the golden vectors from their source gives the frozen bytes exactly", () => {
    const fresh = goldenFiles();
    const frozen = walk(join(ROOT, "golden")).map((f) => relative(join(ROOT, "golden"), f));
    expect([...fresh.keys()].sort()).toEqual(frozen.sort());
    for (const [path, bytes] of fresh) expect(Buffer.compare(readFileSync(join(ROOT, "golden", path)), Buffer.from(bytes)), path).toBe(0);
  });

  it("covers odd and ordinary leaf counts (1, 2, 3, 5 and 7 among them), Unicode, large amounts, transfers, a zero-cash period, corrections and empty optional fields", () => {
    const index = readJson<{ vectors: { name: string; leafCount: string }[] }>(join(ROOT, "golden", "index.json"));
    const names = index.vectors.map((v) => v.name);
    for (const n of ["leaves-1", "leaves-2", "leaves-3", "leaves-5", "leaves-7", "unicode", "large-amounts", "transfers", "zero-cash", "correction", "empty-optional"]) expect(names).toContain(n);
    const zero = readJson<{ leafCount: string; totals: { currencies: { opening: string; closing: string }[] } }>(join(ROOT, "golden", "zero-cash", "vector.json"));
    expect(zero.leafCount).toBe("1");
    expect(zero.totals.currencies[0]!.closing).toBe(zero.totals.currencies[0]!.opening);
    const unicode = readFileSync(join(ROOT, "golden", "unicode", "events", "001.json"), "utf8");
    expect(unicode).toContain("naïve café receipt — 日本語 — €12 — 𝄞 — \\\"quoted\\\"");
  });

  it("the standalone verifier's own implementation reproduces every root, leaf and path", () => {
    const results = checkGolden(join(ROOT, "golden"));
    expect(results.length).toBe(14);
    for (const r of results) expect(r.problems, r.name).toEqual([]);
  });

  it("every golden and bundle JSON file carries the demo label", () => {
    for (const f of walk(ROOT).filter((x) => /\.(?:json|jsonl|csv|md)$/.test(x))) expect(readFileSync(f, "utf8"), f).toContain(DEMO_LABEL);
  });
});
