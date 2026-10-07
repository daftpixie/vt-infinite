import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sealBundle } from "@/packages/ledger-proof/src/bundle.ts";
import { Books, projectBooks, type Allocations } from "@/tools/ledger-exporter/books.ts";
import { verifyBundle } from "@/tools/ledger-verifier/lib/checks.mjs";
import { canonicalize } from "@/tools/ledger-verifier/lib/json.mjs";
import { hex, sha256 } from "@/tools/ledger-verifier/lib/merkle.mjs";
import { main } from "@/tools/ledger-verifier/lib/cli.mjs";
import { BOOKS, copyBundle, IDS, MR48_DIGEST, MR48_DIR, readJson, TAMPERED_DIR } from "./ledger-helpers";

/** Run the CLI in-process and capture what it prints. */
function run(...args: string[]) {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((m: string) => void lines.push(String(m)));
  const err = vi.spyOn(console, "error").mockImplementation((m: string) => void lines.push(String(m)));
  try {
    const code = main(["node", "verify.mjs", ...args]);
    return { code, out: lines.join("\n") };
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
}

const lines = (dir: string) => readFileSync(join(dir, "register.jsonl"), "utf8").split("\n").filter(Boolean);
const writeLines = (dir: string, ls: string[]) => writeFileSync(join(dir, "register.jsonl"), `${ls.join("\n")}\n`);

describe("verifier on the frozen fixtures (MR-34, MR-36, MR-48)", () => {
  it("accepts the MR-48 bundle, reporting each layer separately in plain words", () => {
    const { code, out } = run(MR48_DIR);
    expect(code).toBe(0);
    expect(out).toContain("Environment: Synthetic demo. Demo data — not VT Infinite's financial records.");
    expect(out).toMatch(/^Bundle: VALID/m);
    expect(out).toMatch(/^Inclusion proofs: VALID - 24 of 24/m);
    expect(out).toMatch(/^Chain commitment: NOT ATTEMPTED/m);
    expect(out).toMatch(/^Balance checks: PASSED/m);
    expect(out).toMatch(/^Reconciliation evidence: PRESENT - the scope statement says partially reconciled on 2000-04-03/m);
    expect(out).toMatch(/Open exceptions: 1\n {4}- syn-exc-001 \(unreconciled-item\)/);
    expect(out).toMatch(/^Independent report: ABSENT/m);
    expect(out).not.toMatch(/\bVerified\b/);
    expect(out).toMatch(/do not show that the source records are genuine/);
  });

  it("a valid hash coexists with an open exception and an absent independent report (§23)", () => {
    const r = verifyBundle(MR48_DIR);
    expect(r.bundle.valid && r.inclusion.valid && r.balance.passed).toBe(true);
    expect(r.reconciliation.openExceptions).toHaveLength(1);
    expect(r.review.report).toBe("absent");
    expect(r.chain.state).toBe("not attempted");
  });

  it("rejects the tampered bundle with every failure it is expected to report", () => {
    const expected = readJson<{ exitCode: number; mustReport: string[]; bundleValid: boolean; inclusionValid: boolean; balancePassed: boolean; chain: string }>("fixtures/marrs-rover/tampered.expected.json");
    const { code, out } = run(TAMPERED_DIR);
    expect(code).toBe(expected.exitCode);
    for (const m of expected.mustReport) expect(out).toContain(m);
    const r = verifyBundle(TAMPERED_DIR);
    expect([r.bundle.valid, r.inclusion.valid, r.balance.passed, r.chain.state]).toEqual([expected.bundleValid, expected.inclusionValid, expected.balancePassed, expected.chain]);
  });

  it("--json gives the same separate results for machines", () => {
    const { code, out } = run(MR48_DIR, "--json");
    const j = JSON.parse(out);
    expect(code).toBe(0);
    expect(j).toMatchObject({ ok: true, bundle: { valid: true }, inclusion: { valid: true }, chain: { state: "not attempted" }, balance: { passed: true }, review: { report: "absent" }, prior: { state: "not checked" } });
  });

  it("--expect checks the manifest digest against an outside record", () => {
    expect(run(MR48_DIR, "--expect", MR48_DIGEST).code).toBe(0);
    const r = run(MR48_DIR, "--expect", "0".repeat(64));
    expect(r.code).toBe(1);
    expect(r.out).toContain(`expected manifest SHA-256 ${"0".repeat(64)}, found ${MR48_DIGEST}`);
  });

  it("usage errors exit 2", () => {
    expect(run().code).toBe(2);
    expect(run(MR48_DIR, "--expect", "nothex").code).toBe(2);
  });

  it("--golden reproduces every golden vector with the verifier's own code", () => {
    const { code, out } = run("--golden", "fixtures/marrs-rover/golden");
    expect(code).toBe(0);
    expect(out).toMatch(/All 14 golden vectors reproduced/);
  });
});

describe("independent tamper detection (PRD §23)", () => {
  const cases: [string, (dir: string) => void, RegExp][] = [
    ["a changed amount", (d) => writeLines(d, lines(d).map((l, k) => (k === 0 ? l.replace('"amountMinorUnits":"125000"', '"amountMinorUnits":"125001"') : l))), /register\.jsonl: SHA-256 differs/],
    ["a deleted row", (d) => writeLines(d, lines(d).filter((_, k) => k !== 5)), /the register has 23 events, the manifest says 24/],
    ["a duplicated ID", (d) => {
      const ls = lines(d);
      const id = JSON.parse(ls[3]!).eventId;
      writeLines(d, ls.map((l, k) => (k === 4 ? l.replace(/"eventId":"[^"]+"/, `"eventId":"${id}"`) : l)));
    }, /appears twice/],
    ["reordered rows", (d) => {
      const ls = lines(d);
      [ls[2], ls[3]] = [ls[3]!, ls[2]!];
      writeLines(d, ls);
    }, /line 3 holds sequence 4/],
    ["an invalid proof path", (d) => {
      const p = JSON.parse(readFileSync(join(d, "proofs.json"), "utf8"));
      p.proofs[7].path[1].hash = "f".repeat(64);
      writeFileSync(join(d, "proofs.json"), canonicalize(p));
    }, /proof 8: the path does not lead to the manifest's root/],
    ["a substituted manifest", (d) => {
      const m = JSON.parse(readFileSync(join(d, "manifest.json"), "utf8"));
      m.publishedAt = "2000-04-15T16:00:00Z";
      writeFileSync(join(d, "manifest.json"), canonicalize(m));
    }, /the folder is named 5088d7d5.* but the manifest's SHA-256 is/],
    ["an extra file", (d) => writeFileSync(join(d, "notes.md"), "extra"), /notes\.md is in the folder but not in the manifest/],
    ["a missing file", (d) => rmSync(join(d, "exceptions.json")), /exceptions\.json is listed but missing/],
    ["a file replaced by a symbolic link", (d) => {
      rmSync(join(d, "budgets.json"));
      symlinkSync(join(process.cwd(), MR48_DIR, "budgets.json"), join(d, "budgets.json"));
    }, /budgets\.json is not a regular file/],
    ["a non-canonical rewrite with the same content", (d) => writeFileSync(join(d, "scope.json"), JSON.stringify(JSON.parse(readFileSync(join(d, "scope.json"), "utf8")), null, 1)), /scope\.json is not in canonical form/],
    ["a schema swapped inside schemas.json", (d) => {
      const s = JSON.parse(readFileSync(join(d, "schemas.json"), "utf8"));
      s.schemas.event.additionalProperties = true;
      writeFileSync(join(d, "schemas.json"), canonicalize(s));
    }, /the event schema differs from the published v1 schema/],
  ];

  it.each(cases)("%s fails the bundle", (_, tamper, message) => {
    const dir = copyBundle();
    tamper(dir);
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^Bundle: INVALID/m);
    expect(r.out).toMatch(message);
  });

  it("a summary edited and re-sealed consistently passes the cryptographic checks but fails the balance checks, reported apart", () => {
    const dir = copyBundle();
    const s = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    s.currencies[0].closing = String(BigInt(s.currencies[0].closing) + 100000n);
    const sBytes = Buffer.from(canonicalize(s));
    writeFileSync(join(dir, "summary.json"), sBytes);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    const f = m.files.find((x: { path: string }) => x.path === "summary.json");
    f.sha256 = hex(sha256(sBytes));
    f.bytes = String(sBytes.length);
    const mBytes = Buffer.from(canonicalize(m));
    writeFileSync(join(dir, "manifest.json"), mBytes);
    const resealed = join(dirname(dir), hex(sha256(mBytes)));
    renameSync(dir, resealed);
    const { code, out } = run(resealed);
    expect(code).toBe(1);
    expect(out).toMatch(/^Bundle: VALID/m);
    expect(out).toMatch(/^Inclusion proofs: VALID/m);
    expect(out).toMatch(/^Balance checks: FAILED\n {4}- USD closing: the summary says 5272844, the register gives 5172844/m);
  });
});

describe("amendments keep the earlier publication (MR-21, MR-35)", () => {
  /** A second publication of the same period: every earlier event unchanged, plus an appended reclassification. */
  function amendmentDir(rewrite: boolean) {
    const input = projectBooks(Books.parse(readJson(BOOKS)), readJson<Allocations>(IDS));
    const first = input.events[0]!;
    const later = "2000-05-01T16:00:00Z";
    const { amountMinorUnits, currency, ...rest } = first;
    void amountMinorUnits;
    void currency;
    input.events.push({
      ...rest,
      eventId: "3b6e9a52-6f0e-4d3c-9b7a-2f4d1c8e5a10",
      eventSequence: "25",
      type: "reclassification",
      publishedAt: later,
      effectiveDate: "2000-03-31",
      cashLegs: [],
      classification: { ...first.classification, categoryId: "other-receipts", flow: "none" },
      correction: { originalEventId: first.eventId, kind: "reclassification", reason: "Synthetic: recorded under the wrong category (demo)." },
      purpose: { text: "Synthetic reclassification of event 1; no cash moves (demo)." },
    });
    if (rewrite) input.events[0] = { ...first, purpose: { text: "Synthetic receipt, quietly reworded (demo)." } };
    Object.assign(input, { commitmentSequence: "2", priorRoot: readJson<{ events: { root: string } }>(join(MR48_DIR, "manifest.json")).events.root, amendmentOf: MR48_DIGEST, publishedAt: later });
    const sealed = sealBundle(input);
    const dir = join(mkdtempSync(join(tmpdir(), "rover-amend-")), sealed.digest);
    mkdirSync(dir);
    for (const [n, b] of sealed.files) writeFileSync(join(dir, n), b);
    return dir;
  }

  it("an appended reclassification changes the category without moving cash, and the earlier root continues", () => {
    const dir = amendmentDir(false);
    const r = verifyBundle(dir);
    expect(r.bundle.valid && r.balance.passed).toBe(true);
    expect(readJson<{ counts: { reclassification: string } }>(join(dir, "summary.json")).counts.reclassification).toBe("1");
    expect(readJson<{ currencies: { closing: string }[] }>(join(dir, "summary.json")).currencies[0]!.closing).toBe(readJson<{ currencies: { closing: string }[] }>(join(MR48_DIR, "summary.json")).currencies[0]!.closing);
    const good = run(dir, "--prior", MR48_DIR);
    expect(good.code).toBe(0);
    expect(good.out).toMatch(/^Prior publication: CONTINUOUS/m);
  });

  it("an amendment that rewrites an earlier event is caught", () => {
    const bad = run(amendmentDir(true), "--prior", MR48_DIR);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/^Prior publication: BROKEN\n {4}- the earlier events are not an unchanged prefix/m);
  });
});

describe("entry point: always runs, fails closed (review of PR #13)", () => {
  /** A copy of the verifier somewhere awkward, plus both fixture bundles beside it. */
  function awkwardInstall() {
    const where = mkdtempSync(join(tmpdir(), "rover entry "));
    const home = join(where, "with space", "ledger verifier");
    mkdirSync(dirname(home), { recursive: true });
    cpSync("tools/ledger-verifier", home, { recursive: true });
    // An npm bin install is a symbolic link to the script.
    mkdirSync(join(where, "bin"));
    symlinkSync(join(home, "verify.mjs"), join(where, "bin", "marrs-rover-verify"));
    cpSync(MR48_DIR, join(where, "good", MR48_DIGEST), { recursive: true });
    cpSync(TAMPERED_DIR, join(where, "bad", MR48_DIGEST), { recursive: true });
    return { where, script: join(home, "verify.mjs"), link: join(where, "bin", "marrs-rover-verify"), good: join(where, "good", MR48_DIGEST), bad: join(where, "bad", MR48_DIGEST) };
  }
  const exec = (cmd: string, args: string[], cwd?: string) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8", cwd });

  it.each([
    ["from a path containing a space", "script"],
    ["through a symbolic link", "link"],
  ] as const)("%s it accepts the MR-48 bundle and rejects the tampered one", (_, how) => {
    const i = awkwardInstall();
    expect(i[how]).toMatch(how === "script" ? / / : /marrs-rover-verify$/);
    const ok = exec(i[how], [i.good]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^Bundle: VALID/m);
    expect(ok.stdout).toMatch(/^Result: the bundle, its proofs and its arithmetic check out \(exit 0\)\./m);
    const bad = exec(i[how], [i.bad]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^Bundle: INVALID/m);
    expect(bad.stdout).toContain("register.jsonl: SHA-256 differs from the manifest");
  });

  it("through a relative symbolic link, from another working directory", () => {
    const i = awkwardInstall();
    symlinkSync(join("..", "with space", "ledger verifier", "verify.mjs"), join(i.where, "bin", "rel-verify"));
    const bad = exec(join("bin", "rel-verify"), [join("bad", MR48_DIGEST)], i.where);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^Bundle: INVALID/m);
  });

  it("exits non-zero when main() throws or returns no status: nothing passes by default", () => {
    const i = awkwardInstall();
    const cli = join(dirname(i.script), "lib", "cli.mjs");
    writeFileSync(cli, 'export function main() { throw new Error("synthetic failure"); }\n');
    const thrown = exec(i.script, [i.good]);
    expect(thrown.status).toBe(3);
    expect(thrown.stderr).toContain("Nothing was verified.");
    writeFileSync(cli, "export function main() { return undefined; }\n");
    expect(exec(i.script, [i.good]).status).toBe(3);
    writeFileSync(cli, "export function main() { return 0.5; }\n");
    expect(exec(i.script, [i.good]).status).toBe(3);
  });

  it("verify.mjs has no main-module test to get wrong", () => {
    const src = readFileSync("tools/ledger-verifier/verify.mjs", "utf8");
    expect(src).not.toMatch(/import\.meta\.url|process\.argv\[1\]/);
    expect(src).toMatch(/process\.exitCode = 3;\s*try/);
  });
});

describe("a schema-invalid proofs.json (review of PR #13)", () => {
  it.each([
    ["proofs is not a list", (p: Record<string, unknown>) => (p.proofs = "none")],
    ["a path is not a list", (p: { proofs: { path: unknown }[] }) => (p.proofs[0]!.path = 7)],
    ["an unknown field", (p: Record<string, unknown>) => (p.extra = true)],
  ] as const)("%s: inclusion is NOT CHECKED with the reason, and nothing crashes", (_, mutate) => {
    const dir = copyBundle();
    const p = JSON.parse(readFileSync(join(dir, "proofs.json"), "utf8"));
    (mutate as (x: unknown) => void)(p);
    writeFileSync(join(dir, "proofs.json"), canonicalize(p));
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/^Bundle: INVALID/m);
    expect(out).toMatch(/proofs\.json\//);
    expect(out).toMatch(/^Inclusion proofs: NOT CHECKED - proofs\.json does not match its v1 schema, so no inclusion proof was checked\./m);
    expect(out).toMatch(/^Balance checks: PASSED/m);
  });

  it("a schema-invalid summary skips the balance step the same way", () => {
    const dir = copyBundle();
    const s = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    s.currencies = "USD";
    writeFileSync(join(dir, "summary.json"), canonicalize(s));
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/^Balance checks: NOT CHECKED - summary\.json does not match its v1 schema, so no totals were recomputed\./m);
  });
});

describe("which publication (review of PR #13)", () => {
  it("without --expect, says the result shows internal consistency only", () => {
    expect(run(MR48_DIR).out).toMatch(/^Which publication: NOT CHECKED - no outside manifest SHA-256 was given \(--expect\), so this result shows internal consistency only, not which publication this is\.$/m);
  });
  it("with --expect, says whether it matched", () => {
    expect(run(MR48_DIR, "--expect", MR48_DIGEST).out).toMatch(/^Which publication: MATCHED/m);
    expect(run(MR48_DIR, "--expect", "0".repeat(64)).out).toMatch(/^Which publication: MISMATCHED/m);
  });
});

describe("standalone (MR-34)", () => {
  it("imports nothing but Node built-ins and its own files, and declares no dependencies", () => {
    const files = ["verify.mjs", ...readdirSync("tools/ledger-verifier/lib").map((f) => `lib/${f}`)];
    for (const f of files) {
      for (const m of readFileSync(`tools/ledger-verifier/${f}`, "utf8").matchAll(/\bfrom\s+"([^"]+)"/g)) expect(m[1], f).toMatch(/^(?:node:|\.\.?\/)/);
    }
    expect(readJson<{ dependencies: object; license: string }>("tools/ledger-verifier/package.json")).toMatchObject({ dependencies: {}, license: "Apache-2.0" });
    expect(readFileSync("tools/ledger-verifier/LICENSE", "utf8")).toBe(readFileSync("LICENSE", "utf8"));
  });

  it("runs from a copy of its folder outside the repository, with plain Node", () => {
    const where = mkdtempSync(join(tmpdir(), "rover-standalone-"));
    cpSync("tools/ledger-verifier", join(where, "verifier"), { recursive: true });
    cpSync(MR48_DIR, join(where, MR48_DIGEST), { recursive: true });
    const ok = spawnSync(process.execPath, ["verifier/verify.mjs", MR48_DIGEST], { cwd: where, encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^Bundle: VALID/m);
    cpSync(TAMPERED_DIR, join(where, "tampered", MR48_DIGEST), { recursive: true });
    const bad = spawnSync(process.execPath, ["verifier/verify.mjs", join("tampered", MR48_DIGEST)], { cwd: where, encoding: "utf8" });
    expect(bad.status).toBe(1);
  });
});
