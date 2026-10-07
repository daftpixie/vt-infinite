import { canonicalString } from "./canonical.ts";
import { FINANCIAL_TYPES, NON_FINANCIAL_TYPES, type EventType } from "./constants.ts";
import type { BucketLine, CurrencyLine, FundLine, PeriodSummary, PublicEvent } from "./types.ts";

/**
 * Exact balance arithmetic (PRD MR-17 to MR-19). Every amount is an integer
 * number of minor units held as a BigInt; nothing passes through a float.
 * Totals are always per currency: `Money` refuses to add two currencies, so
 * an unlabeled cross-currency total cannot be produced by accident.
 */
const CANONICAL_INT = /^(?:0|-?[1-9][0-9]*)$/;

export function parseMinor(s: string): bigint {
  if (!CANONICAL_INT.test(s)) throw new TypeError(`not a canonical integer: ${JSON.stringify(s)}`);
  return BigInt(s);
}

/** Canonical decimal string: no plus sign, no leading zeros, never "-0". */
export const formatMinor = (n: bigint): string => n.toString();

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`cannot combine ${a} and ${b} without a declared conversion`);
    this.name = "CurrencyMismatchError";
  }
}

export class Money {
  readonly currency: string;
  readonly minor: bigint;
  constructor(currency: string, minor: bigint) {
    this.currency = currency;
    this.minor = minor;
  }
  plus(o: Money): Money {
    if (o.currency !== this.currency) throw new CurrencyMismatchError(this.currency, o.currency);
    return new Money(this.currency, this.minor + o.minor);
  }
}

/** Sum amounts that must all share one currency. */
export function sumSameCurrency(items: Money[]): Money {
  if (items.length === 0) throw new RangeError("nothing to sum");
  return items.slice(1).reduce((a, b) => a.plus(b), items[0] as Money);
}

export type Openings = {
  buckets: { bucketId: string; currency: string; opening: string }[];
  restrictedFunds: { restrictionId: string; currency: string; opening: string }[];
};

type Acc = { opening: bigint; recOp: bigint; recFin: bigint; disOp: bigint; disFin: bigint; rev: bigint; internal: bigint; boundary: bigint; legs: bigint };

const legSum = (e: PublicEvent) => e.cashLegs.reduce((a, l) => a + parseMinor(l.deltaMinorUnits), 0n);

/**
 * Compute the period's totals from the complete register, never from a
 * page of it (MR-18): for each currency,
 *
 *   closing = opening + receipts - disbursements + reversalsNet
 *             + internal transfers (always 0) + boundary transfers
 *
 * and each restricted fund rolls forward the same way, per currency. The
 * formula is checked against the plain sum of every cash leg.
 */
export function computeTotals(events: PublicEvent[], openings: Openings): Pick<PeriodSummary, "currencies" | "buckets" | "restrictedFunds" | "counts"> {
  const cur = new Map<string, Acc>();
  const acc = (c: string): Acc => {
    let a = cur.get(c);
    if (!a) cur.set(c, (a = { opening: 0n, recOp: 0n, recFin: 0n, disOp: 0n, disFin: 0n, rev: 0n, internal: 0n, boundary: 0n, legs: 0n }));
    return a;
  };
  const buckets = new Map<string, { currency: string; opening: bigint; closing: bigint }>();
  for (const b of openings.buckets) {
    if (buckets.has(b.bucketId)) throw new Error(`duplicate opening for bucket ${b.bucketId}`);
    const o = parseMinor(b.opening);
    buckets.set(b.bucketId, { currency: b.currency, opening: o, closing: o });
    acc(b.currency).opening += o;
  }
  const funds = new Map<string, { restrictionId: string; currency: string; opening: bigint; rec: bigint; dis: bigint; rev: bigint }>();
  const fundKey = (r: string, c: string) => `${r}\u0000${c}`;
  for (const f of openings.restrictedFunds) {
    funds.set(fundKey(f.restrictionId, f.currency), { restrictionId: f.restrictionId, currency: f.currency, opening: parseMinor(f.opening), rec: 0n, dis: 0n, rev: 0n });
  }
  const fund = (r: string, c: string) => {
    const k = fundKey(r, c);
    let f = funds.get(k);
    if (!f) funds.set(k, (f = { restrictionId: r, currency: c, opening: 0n, rec: 0n, dis: 0n, rev: 0n }));
    return f;
  };

  const counts = Object.fromEntries([...FINANCIAL_TYPES, ...NON_FINANCIAL_TYPES].map((t) => [t, 0])) as Record<EventType, number>;
  for (const e of events) {
    counts[e.type] += 1;
    for (const l of e.cashLegs) {
      const d = parseMinor(l.deltaMinorUnits);
      const a = acc(l.currency);
      a.legs += d;
      const b = buckets.get(l.bucketId);
      if (!b) throw new Error(`event ${e.eventSequence}: bucket ${l.bucketId} has no opening balance`);
      if (b.currency !== l.currency) throw new CurrencyMismatchError(b.currency, l.currency);
      b.closing += d;
      if (l.boundary === "internal") a.internal += d;
      if (l.boundary === "boundary") a.boundary += d;
    }
    if (!FINANCIAL_TYPES.includes(e.type as (typeof FINANCIAL_TYPES)[number])) continue;
    const c = e.currency as string;
    const amount = parseMinor(e.amountMinorUnits as string);
    const a = acc(c);
    const fin = e.classification.flow === "financing";
    if (e.type === "receipt") {
      if (fin) a.recFin += amount;
      else a.recOp += amount;
    }
    if (e.type === "disbursement") {
      if (fin) a.disFin += amount;
      else a.disOp += amount;
    }
    if (e.type === "reversal") a.rev += legSum(e);
    const r = e.classification.restrictionId;
    if (r) {
      const f = fund(r, c);
      if (e.type === "receipt") f.rec += amount;
      if (e.type === "disbursement") f.dis += amount;
      if (e.type === "reversal") f.rev += legSum(e);
    }
  }

  const currencies: CurrencyLine[] = [...cur.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([currency, a]) => {
      const closing = a.opening + a.recOp + a.recFin - a.disOp - a.disFin + a.rev + a.internal + a.boundary;
      if (closing !== a.opening + a.legs) throw new Error(`${currency}: the summary lines do not account for every cash leg`);
      return {
        currency,
        opening: formatMinor(a.opening),
        receipts: { operating: formatMinor(a.recOp), financing: formatMinor(a.recFin) },
        disbursements: { operating: formatMinor(a.disOp), financing: formatMinor(a.disFin) },
        reversalsNet: formatMinor(a.rev),
        transfers: { internalNet: formatMinor(a.internal), boundaryNet: formatMinor(a.boundary) },
        closing: formatMinor(closing),
      };
    });
  const bucketLines: BucketLine[] = [...buckets.entries()]
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([bucketId, b]) => ({ bucketId, currency: b.currency, opening: formatMinor(b.opening), closing: formatMinor(b.closing) }));
  const fundLines: FundLine[] = [...funds.values()]
    .sort((x, y) => (fundKey(x.restrictionId, x.currency) < fundKey(y.restrictionId, y.currency) ? -1 : 1))
    .map((f) => ({
      restrictionId: f.restrictionId,
      currency: f.currency,
      opening: formatMinor(f.opening),
      receipts: formatMinor(f.rec),
      disbursements: formatMinor(f.dis),
      reversalsNet: formatMinor(f.rev),
      closing: formatMinor(f.opening + f.rec - f.dis + f.rev),
    }));
  const financial = events.filter((e) => FINANCIAL_TYPES.includes(e.type as (typeof FINANCIAL_TYPES)[number])).length;
  return {
    currencies,
    buckets: bucketLines,
    restrictedFunds: fundLines,
    counts: {
      events: String(events.length),
      financialEvents: String(financial),
      ...(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, String(v)])) as Record<EventType, string>),
    },
  };
}

/**
 * Balance checks on computed totals (MR-18, MR-19): internal transfers net
 * to zero, buckets add up to the currency total, and restricted funds are
 * never overdrawn or larger together than the cash that holds them.
 */
export function balanceIssues(t: Pick<PeriodSummary, "currencies" | "buckets" | "restrictedFunds">): string[] {
  const out: string[] = [];
  for (const c of t.currencies) {
    if (c.transfers.internalNet !== "0") out.push(`${c.currency}: internal transfers net to ${c.transfers.internalNet}, not 0`);
    const buckets = t.buckets.filter((b) => b.currency === c.currency).reduce((a, b) => a + parseMinor(b.closing), 0n);
    if (buckets !== parseMinor(c.closing)) out.push(`${c.currency}: bucket closings add to ${buckets}, not the closing ${c.closing}`);
    const restricted = t.restrictedFunds.filter((f) => f.currency === c.currency).reduce((a, f) => a + parseMinor(f.closing), 0n);
    if (restricted > parseMinor(c.closing)) out.push(`${c.currency}: restricted funds (${restricted}) exceed the cash that holds them (${c.closing})`);
  }
  for (const f of t.restrictedFunds) if (parseMinor(f.closing) < 0n) out.push(`${f.restrictionId} ${f.currency}: restricted fund overdrawn (${f.closing})`);
  return out;
}

/** Field-by-field differences between a stated summary and the recomputed one. */
export function summaryDiscrepancies(stated: Pick<PeriodSummary, "currencies" | "buckets" | "restrictedFunds" | "counts">, computed: ReturnType<typeof computeTotals>): string[] {
  const out: string[] = [];
  const cmp = (label: string, a: unknown, b: unknown) => {
    // Compared as canonical JSON, so key order never matters.
    if (canonicalString(a) !== canonicalString(b)) out.push(`${label}: stated ${JSON.stringify(a)}, recomputed ${JSON.stringify(b)}`);
  };
  cmp("currencies", stated.currencies, computed.currencies);
  cmp("buckets", stated.buckets, computed.buckets);
  cmp("restrictedFunds", stated.restrictedFunds, computed.restrictedFunds);
  cmp("counts", stated.counts, computed.counts);
  return out;
}
