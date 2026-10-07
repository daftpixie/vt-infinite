import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { balanceIssues, computeTotals, CurrencyMismatchError, formatMinor, Money, parseMinor, sumSameCurrency } from "@/packages/ledger-proof/src/arithmetic.ts";
import { sealBundle, SealError } from "@/packages/ledger-proof/src/bundle.ts";
import { DEMO_LABEL } from "@/packages/ledger-proof/src/constants.ts";
import { registerIssues, type RegisterContext } from "@/packages/ledger-proof/src/invariants.ts";
import { readCurrencies } from "@/packages/ledger-proof/src/schemas.ts";
import type { PublicEvent } from "@/packages/ledger-proof/src/types.ts";
import { allocate, Books, BooksError, projectBooks, type Allocations } from "@/tools/ledger-exporter/books.ts";
import { exportBooks, SealedConflictError } from "@/tools/ledger-exporter/export.ts";
import { registerProblems } from "@/tools/ledger-verifier/lib/checks.mjs";
import { BOOKS, clone, IDS, MR48_DIGEST, mr48, mr48Events, readJson } from "./ledger-helpers";

const books = () => Books.parse(readJson(BOOKS));
const ids = () => readJson<Allocations>(IDS);
const scope = () => mr48<{ buckets: { bucketId: string; currency: string; label: string }[]; restrictedFunds: { restrictionId: string; label: string }[] }>("scope.json");
const ctx = (): RegisterContext => ({
  entityId: "demo",
  periodId: "2000-Q1",
  periodStart: "2000-01-01",
  periodEnd: "2000-03-31",
  publishedAt: "2000-04-14T16:00:00Z",
  scope: scope(),
  currencies: readCurrencies(),
});
const verifierCtx = () => ({ ...ctx(), exponents: readCurrencies().exponents });
/** Both implementations must flag the same register as broken. */
const rules = (events: PublicEvent[]) => registerIssues(events, ctx()).map((i) => i.rule);
const verifierFlags = (events: PublicEvent[]) => registerProblems(events, verifierCtx()).length > 0;
const openings = () => ({
  buckets: mr48<{ buckets: { bucketId: string; currency: string; opening: string }[] }>("summary.json").buckets.map(({ bucketId, currency, opening }) => ({ bucketId, currency, opening })),
  restrictedFunds: mr48<{ restrictedFunds: { restrictionId: string; currency: string; opening: string }[] }>("summary.json").restrictedFunds.map(({ restrictionId, currency, opening }) => ({ restrictionId, currency, opening })),
});

describe("exact integer arithmetic (MR-18, MR-19)", () => {
  it("parses only canonical integers and formats them back unchanged", () => {
    for (const ok of ["0", "1", "-1", "99999999999999"]) expect(formatMinor(parseMinor(ok))).toBe(ok);
    for (const bad of ["-0", "01", "+1", "1.0", "1e3", "", " 1"]) expect(() => parseMinor(bad), bad).toThrow();
  });

  it("is exact far above 2^53, where floating point is not", () => {
    const big = 2n ** 53n + 1n;
    const a = formatMinor(big);
    expect(Number(a) + 1).toBe(Number(a)); // a float cannot even see the + 1
    expect(formatMinor(parseMinor(a) + 1n)).toBe(formatMinor(big + 1n));
    const huge = 10n ** 28n + 7n; // 29 digits, within the schema's 30-digit limit
    const e = { ...mr48Events()[0]!, amountMinorUnits: formatMinor(huge), cashLegs: [{ ...mr48Events()[0]!.cashLegs[0]!, deltaMinorUnits: formatMinor(huge) }] };
    const t = computeTotals([e], { buckets: [{ bucketId: "operating-cash", currency: "USD", opening: formatMinor(huge) }], restrictedFunds: [] });
    expect(t.currencies[0]?.closing).toBe(formatMinor(huge * 2n));
  });

  it("never adds two currencies without a declared conversion", () => {
    expect(() => new Money("USD", 1n).plus(new Money("EUR", 1n))).toThrow(CurrencyMismatchError);
    expect(() => sumSameCurrency([new Money("USD", 1n), new Money("USD", 2n), new Money("JPY", 3n)])).toThrow(CurrencyMismatchError);
    expect(sumSameCurrency([new Money("USD", 1n), new Money("USD", 2n)]).minor).toBe(3n);
  });

  it("totals each currency separately", () => {
    const usd = mr48Events()[0]!;
    const eur = { ...usd, eventId: "0f3a1c2e-0000-4000-8000-000000000001", eventSequence: "2", currency: "EUR", cashLegs: [{ ...usd.cashLegs[0]!, currency: "EUR", bucketId: "eur-cash" }] };
    const t = computeTotals([usd, eur], {
      buckets: [
        { bucketId: "operating-cash", currency: "USD", opening: "0" },
        { bucketId: "eur-cash", currency: "EUR", opening: "0" },
      ],
      restrictedFunds: [],
    });
    expect(t.currencies.map((c) => [c.currency, c.closing])).toEqual([
      ["EUR", "125000"],
      ["USD", "125000"],
    ]);
  });

  it("MR-48: opening + receipts - disbursements + reversals + transfers = closing, for cash and each fund", () => {
    const t = computeTotals(mr48Events(), openings());
    const usd = t.currencies[0]!;
    const n = (s: string) => BigInt(s);
    expect(n(usd.opening) + n(usd.receipts.operating) + n(usd.receipts.financing) - n(usd.disbursements.operating) - n(usd.disbursements.financing) + n(usd.reversalsNet) + n(usd.transfers.internalNet) + n(usd.transfers.boundaryNet)).toBe(n(usd.closing));
    expect(usd.transfers.internalNet).toBe("0"); // internal transfers cancel
    expect(usd.receipts.financing).toBe("1000000"); // the loan is financing, not income
    expect(t.buckets.reduce((s, b) => s + n(b.closing), 0n)).toBe(n(usd.closing));
    for (const f of t.restrictedFunds) expect(n(f.opening) + n(f.receipts) - n(f.disbursements) + n(f.reversalsNet)).toBe(n(f.closing));
    expect(balanceIssues(t)).toEqual([]);
    // Restricted funds are part of cash, never added on top of it.
    expect(t.restrictedFunds.reduce((s, f) => s + n(f.closing), 0n) <= n(usd.closing)).toBe(true);
  });

  it("the correction changes the balance by exactly the difference, and the original stays in the register", () => {
    const events = mr48Events();
    const original = events.find((e) => e.eventSequence === "17")!;
    const reversal = events.find((e) => e.type === "reversal")!;
    const replacement = events.find((e) => e.correction?.kind === "replacement")!;
    expect(reversal.correction?.originalEventId).toBe(original.eventId);
    expect(replacement.correction?.originalEventId).toBe(original.eventId);
    const net = (e: PublicEvent) => e.cashLegs.reduce((s, l) => s + BigInt(l.deltaMinorUnits), 0n);
    expect(net(original) + net(reversal)).toBe(0n);
    expect(net(original) + net(reversal) + net(replacement)).toBe(-46000n);
  });

  it("flags an overdrawn restricted fund, restricted funds larger than cash, and internal transfers that do not cancel", () => {
    const t = computeTotals(mr48Events(), openings());
    const bad = clone(t);
    bad.restrictedFunds[0]!.closing = "-1";
    expect(balanceIssues(bad).join()).toMatch(/overdrawn/);
    const big = clone(t);
    big.restrictedFunds[0]!.closing = big.currencies[0]!.closing;
    expect(balanceIssues(big).join()).toMatch(/exceed the cash/);
    const leak = clone(t);
    leak.currencies[0]!.transfers.internalNet = "5";
    expect(balanceIssues(leak).join()).toMatch(/internal transfers net to 5/);
  });

  it("a boundary transfer changes in-scope cash; an internal one does not (partial scope)", () => {
    const tr = mr48Events().find((e) => e.type === "transfer")!;
    const out: PublicEvent = { ...tr, transferKind: "boundary", cashLegs: [{ ...tr.cashLegs[0]!, boundary: "boundary" }], amountMinorUnits: tr.cashLegs[0]!.deltaMinorUnits.replace("-", "") };
    const within = computeTotals([tr], openings()).currencies[0]!;
    const across = computeTotals([out], openings()).currencies[0]!;
    expect(within.closing).toBe(within.opening);
    expect(BigInt(across.closing) - BigInt(across.opening)).toBe(BigInt(out.cashLegs[0]!.deltaMinorUnits));
    expect(across.transfers.boundaryNet).toBe(out.cashLegs[0]!.deltaMinorUnits);
  });
});

describe("register rules (MR-21, MR-28): the library and the verifier flag the same breakage", () => {
  it("the MR-48 register is clean in both", () => {
    expect(rules(mr48Events())).toEqual([]);
    expect(verifierFlags(mr48Events())).toBe(false);
  });

  const mutate = (fn: (events: PublicEvent[]) => void) => {
    const e = clone(mr48Events());
    fn(e);
    return e;
  };
  const at = (events: PublicEvent[], seq: string) => events.find((e) => e.eventSequence === seq)!;
  const cases: [string, string, (events: PublicEvent[]) => void][] = [
    ["duplicated event ID", "unique-id", (e) => (at(e, "5").eventId = at(e, "4").eventId)],
    ["reordered sequence", "sequence", (e) => ([e[3], e[4]] = [e[4]!, e[3]!])],
    ["skipped sequence", "sequence", (e) => e.splice(6, 1)],
    ["a receipt whose leg differs from its amount", "receipt-legs", (e) => (at(e, "1").cashLegs[0]!.deltaMinorUnits = "124999")],
    ["a disbursement with a positive leg", "disbursement-legs", (e) => (at(e, "11").cashLegs[0]!.deltaMinorUnits = "45000")],
    ["an internal transfer that does not cancel", "transfer-legs", (e) => (at(e, "21").cashLegs[1]!.deltaMinorUnits = "299999")],
    ["a transfer between the same bucket", "transfer-legs", (e) => (at(e, "21").cashLegs[1]!.bucketId = at(e, "21").cashLegs[0]!.bucketId)],
    ["a reversal of the wrong amount", "reversal", (e) => {
      const r = e.find((x) => x.type === "reversal")!;
      r.amountMinorUnits = "63000";
      r.cashLegs[0]!.deltaMinorUnits = "63000";
    }],
    ["a reversal to a different fund", "reversal", (e) => (e.find((x) => x.type === "reversal")!.classification.restrictionId = "fund-b")],
    ["a replacement before its reversal", "replacement", (e) => {
      const r = e.findIndex((x) => x.type === "reversal");
      const p = e.findIndex((x) => x.correction?.kind === "replacement");
      [e[r], e[p]] = [e[p]!, e[r]!];
      e[r]!.eventSequence = String(r + 1);
      e[p]!.eventSequence = String(p + 1);
    }],
    ["a correction pointing at a missing event", "reference", (e) => (e.find((x) => x.type === "reversal")!.correction!.originalEventId = "11111111-1111-4111-8111-111111111111")],
    ["an unknown bucket", "bucket", (e) => (at(e, "1").cashLegs[0]!.bucketId = "bank-account-9")],
    ["a currency outside the mapping", "currency", (e) => {
      at(e, "1").currency = "GBP";
      at(e, "1").cashLegs[0]!.currency = "GBP";
    }],
    ["a leg in another currency", "leg-currency", (e) => (at(e, "1").cashLegs[0]!.currency = "EUR")],
    ["an impossible date", "date", (e) => (at(e, "1").effectiveDate = "2000-02-30")],
    ["a date outside the period", "date", (e) => (at(e, "1").effectiveDate = "2000-04-01")],
    ["an unknown restricted fund", "restriction", (e) => (at(e, "2").classification.restrictionId = "fund-z")],
    ["another entity's event", "entity", (e) => (at(e, "3").entityId = "other")],
  ];
  it.each(cases)("%s", (_, rule, fn) => {
    const events = mutate(fn);
    expect(rules(events)).toContain(rule);
    expect(verifierFlags(events)).toBe(true);
  });

  it("a second reversal of the same event", () => {
    const events = clone(mr48Events());
    const r = clone(events.find((x) => x.type === "reversal")!);
    r.eventId = "22222222-2222-4222-8222-222222222222";
    r.eventSequence = String(events.length + 1);
    events.push(r);
    expect(rules(events)).toContain("reversal");
    expect(verifierFlags(events)).toBe(true);
  });
});

describe("books and exporter (MR-15 to MR-21, MR-31, MR-48)", () => {
  it("MR-48: 10 receipts, 10 disbursements, two restricted funds, one correction and one open exception; the manifest states the actual count", () => {
    const events = mr48Events();
    const count = (t: string) => events.filter((e) => e.type === t && !e.correction).length;
    expect(count("receipt")).toBe(10);
    expect(count("disbursement")).toBe(10);
    expect(new Set(events.map((e) => e.classification.restrictionId).filter(Boolean))).toEqual(new Set(["fund-a", "fund-b"]));
    expect(events.filter((e) => e.correction).map((e) => e.correction!.kind)).toEqual(["reversal", "replacement"]);
    expect(mr48<{ exceptions: { status: string; kind: string }[] }>("exceptions.json").exceptions).toEqual([expect.objectContaining({ status: "open", kind: "unreconciled-item" })]);
    expect(mr48<{ events: { count: string } }>("manifest.json").events.count).toBe(String(events.length));
    expect(events.length).toBe(24);
  });

  it("every file of the bundle carries the demo label, and nothing private: no source IDs, account numbers or account names", () => {
    const dir = `fixtures/marrs-rover/bundles/demo/2000-Q1/${MR48_DIGEST}`;
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).toContain(DEMO_LABEL);
      // Source entry IDs, the journal's account field and its non-cash account names are private; bucket labels are public.
      expect(text, f).not.toMatch(/J-\d{4}|"account"|sourceId|Loan principal \(synthetic\)|Program service fees \(synthetic\)|Contract services \(synthetic\)/);
    }
    for (const line of readFileSync(join(dir, "register.jsonl"), "utf8").split("\n").filter(Boolean)) expect(JSON.parse(line).demoLabel).toBe(DEMO_LABEL);
    const csv = readFileSync(join(dir, "register.csv"), "utf8").split("\r\n").filter(Boolean);
    for (const row of csv.slice(1)) expect(row.startsWith(DEMO_LABEL)).toBe(true);
  });

  it("rejects unbalanced journal entries, unknown accounts and a reversal that does not mirror its original", () => {
    const b = clone(readJson<Record<string, unknown>>(BOOKS)) as { entries: { lines: Record<string, string>[]; kind: string }[] };
    b.entries[0]!.lines[0]!.debit = "125001";
    expect(() => projectBooks(Books.parse(b), ids())).toThrow(/debits and credits differ/);
    const c = clone(readJson<Record<string, unknown>>(BOOKS)) as { entries: { lines: Record<string, string>[] }[] };
    c.entries[0]!.lines[1]!.account = "9999";
    expect(() => projectBooks(Books.parse(c), ids())).toThrow(BooksError);
    const d = clone(readJson<Record<string, unknown>>(BOOKS)) as { entries: { kind: string; lines: Record<string, string>[] }[] };
    const rev = d.entries.find((e) => e.kind === "reversal")!;
    rev.lines = [{ account: "5000", credit: "60000" }, { account: "1000", debit: "60000" }];
    expect(() => projectBooks(Books.parse(d), ids())).toThrow(/mirrors every line/);
  });

  it("refuses to seal when a register rule or balance fails", () => {
    const input = projectBooks(books(), ids());
    input.events[0]!.amountMinorUnits = "1";
    expect(() => sealBundle(input)).toThrow(SealError);
  });

  it("is deterministic: the same books and allocations give the frozen bundle, byte for byte", () => {
    const out = mkdtempSync(join(tmpdir(), "rover-export-"));
    const r = exportBooks(readJson(BOOKS), readJson(IDS), out);
    expect(r.bundle.digest).toBe(MR48_DIGEST);
    for (const [name, bytes] of r.bundle.files) expect(Buffer.compare(readFileSync(join(r.dir, name)), Buffer.from(bytes)), name).toBe(0);
  });

  it("never rewrites a sealed bundle: same bytes are a no-op, different bytes are refused", () => {
    const out = mkdtempSync(join(tmpdir(), "rover-seal-"));
    const first = exportBooks(readJson(BOOKS), readJson(IDS), out);
    expect(first.written).toBe(true);
    expect(exportBooks(readJson(BOOKS), readJson(IDS), out).written).toBe(false);
    writeFileSync(join(first.dir, "summary.json"), "{}");
    expect(() => exportBooks(readJson(BOOKS), readJson(IDS), out)).toThrow(SealedConflictError);
    expect(readdirSync(join(out, "demo", "2000-Q1")).filter((n) => n.includes("partial"))).toEqual([]);
  });

  it("allocations are stable: existing public IDs never change, new entries get new random IDs and the next sequence", () => {
    const b = books();
    const existing = ids();
    expect(allocate(b, existing).added).toEqual([]);
    const extended = clone(readJson<{ entries: unknown[] }>(BOOKS));
    extended.entries.push({ ...(extended.entries[0] as object), sourceId: "J-9999" });
    const { allocations, added } = allocate(Books.parse(extended), existing);
    expect(added).toEqual(["J-9999"]);
    expect(allocations["J-9999"]?.eventSequence).toBe("25");
    for (const [k, v] of Object.entries(existing)) expect(allocations[k]).toEqual(v);
    expect(() => projectBooks(Books.parse(extended), existing)).toThrow(/no public ID allocated/);
  });

  it("the exporter's privacy gate stops a bundle with a private name in it; nothing is written", () => {
    const b = clone(readJson<{ entries: { purpose: string }[] }>(BOOKS));
    b.entries[0]!.purpose = "Synthetic receipt, paid to Jane Placeholder (demo).";
    const out = mkdtempSync(join(tmpdir(), "rover-priv-"));
    expect(() => exportBooks(b, readJson(IDS), out)).toThrow(/privacy scan failed/);
    expect(existsSync(join(out, "demo"))).toBe(false);
  });
});
