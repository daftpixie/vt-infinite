import { parseMinor } from "./arithmetic.ts";
import { FINANCIAL_TYPES } from "./constants.ts";
import type { CurrencyMap } from "./schemas.ts";
import type { CashLeg, PublicEvent, ScopeStatement } from "./types.ts";

/**
 * Rules over a complete register that a JSON Schema cannot express
 * (PRD MR-18, MR-19, MR-21, MR-28). Each issue names the event by its
 * sequence and a rule ID, so the verifier and tests can match them.
 */
export type Issue = { rule: string; at: string; message: string };

export type RegisterContext = {
  entityId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  /** Latest permitted publication time (the manifest's). */
  publishedAt: string;
  scope: Pick<ScopeStatement, "buckets" | "restrictedFunds">;
  currencies: CurrencyMap;
};

const isFinancial = (e: PublicEvent) => FINANCIAL_TYPES.includes(e.type as (typeof FINANCIAL_TYPES)[number]);

/** A real calendar date (the schema pattern accepts 2026-02-31). */
export function isCalendarDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const legKey = (l: CashLeg) => `${l.bucketId}\u0000${l.currency}\u0000${l.boundary}\u0000${l.deltaMinorUnits}`;
const negate = (l: CashLeg): CashLeg => ({ ...l, deltaMinorUnits: (-parseMinor(l.deltaMinorUnits)).toString() });
const sameMultiset = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

export function registerIssues(events: PublicEvent[], ctx: RegisterContext): Issue[] {
  const out: Issue[] = [];
  const add = (rule: string, e: PublicEvent | null, message: string) => out.push({ rule, at: e ? `event ${e.eventSequence}` : "register", message });

  if (events.length === 0) add("non-empty", null, "a publication has at least one event (MR-33)");

  const buckets = new Map(ctx.scope.buckets.map((b) => [b.bucketId, b.currency]));
  const funds = new Set(ctx.scope.restrictedFunds.map((f) => f.restrictionId));
  const byId = new Map<string, PublicEvent>();
  const reversed = new Map<string, PublicEvent>();

  events.forEach((e, i) => {
    // Identity, order and scope.
    if (byId.has(e.eventId)) add("unique-id", e, `duplicate event ID ${e.eventId}`);
    if (e.eventSequence !== String(i + 1)) add("sequence", e, `register position ${i + 1} holds sequence ${e.eventSequence}; sequences run 1, 2, 3 … in order, each once`);
    if (e.entityId !== ctx.entityId) add("entity", e, `entity ${e.entityId} is not ${ctx.entityId}`);
    if (e.periodId !== ctx.periodId) add("period", e, `period ${e.periodId} is not ${ctx.periodId}`);
    if (!isCalendarDate(e.effectiveDate)) add("date", e, `${e.effectiveDate} is not a calendar date`);
    else if (e.effectiveDate < ctx.periodStart || e.effectiveDate > ctx.periodEnd) add("date", e, `effective date ${e.effectiveDate} is outside the period`);
    if (e.publishedAt > ctx.publishedAt) add("published-at", e, "published after the publication itself");
    if (e.classification.restrictionId !== null && !funds.has(e.classification.restrictionId)) add("restriction", e, `restriction ${e.classification.restrictionId} is not in the scope statement`);

    // Currency and legs.
    if (e.currency !== undefined && !(e.currency in ctx.currencies.exponents)) add("currency", e, `currency ${e.currency} is not in the currency mapping`);
    const legIds = new Set<string>();
    for (const l of e.cashLegs) {
      if (legIds.has(l.legId)) add("leg-id", e, `duplicate leg ID ${l.legId}`);
      legIds.add(l.legId);
      if (l.currency !== e.currency) add("leg-currency", e, `leg ${l.legId} is in ${l.currency}, the event in ${e.currency}; one event never mixes currencies`);
      const bc = buckets.get(l.bucketId);
      if (bc === undefined) add("bucket", e, `bucket ${l.bucketId} is not in the scope statement`);
      else if (bc !== l.currency) add("bucket", e, `bucket ${l.bucketId} holds ${bc}, not ${l.currency}`);
    }

    // Per-type leg rules (MR-28 v1).
    if (isFinancial(e) && e.amountMinorUnits !== undefined) {
      const amount = parseMinor(e.amountMinorUnits);
      const deltas = e.cashLegs.map((l) => parseMinor(l.deltaMinorUnits));
      const sum = deltas.reduce((a, b) => a + b, 0n);
      const all = (b: CashLeg["boundary"]) => e.cashLegs.every((l) => l.boundary === b);
      if (e.type === "receipt" && !(all("external") && deltas.every((d) => d > 0n) && sum === amount))
        add("receipt-legs", e, "a receipt's legs are external, positive and add up to its amount");
      if (e.type === "disbursement" && !(all("external") && deltas.every((d) => d < 0n) && sum === -amount))
        add("disbursement-legs", e, "a disbursement's legs are external, negative and add up to minus its amount");
      if (e.type === "transfer") {
        if (e.classification.restrictionId !== null) add("transfer-restriction", e, "a transfer moves cash between buckets; it does not carry a restriction in v1");
        if (e.transferKind === "internal") {
          const [a, b] = e.cashLegs;
          const ok = e.cashLegs.length === 2 && all("internal") && a !== undefined && b !== undefined && a.bucketId !== b.bucketId && sum === 0n && (deltas[0] === amount || deltas[0] === -amount);
          if (!ok) add("transfer-legs", e, "an internal transfer has two internal legs in different buckets, equal and opposite, each the transfer's amount");
        } else if (!(e.cashLegs.length === 1 && all("boundary") && (sum === amount || sum === -amount))) {
          add("transfer-legs", e, "a boundary transfer has one boundary leg of the transfer's amount");
        }
      }
    }

    // Corrections append and point back (MR-21).
    if (e.correction) {
      const orig = byId.get(e.correction.originalEventId);
      if (!orig) add("reference", e, `corrects ${e.correction.originalEventId}, which is not an earlier event in this register`);
      else if (!isFinancial(orig) || orig.type === "reversal") add("reference", e, `corrects event ${orig.eventSequence}, which is not an original financial event`);
      else if (e.type === "reversal") {
        if (reversed.has(orig.eventId)) add("reversal", e, `event ${orig.eventSequence} is already reversed by event ${reversed.get(orig.eventId)?.eventSequence}`);
        const exact =
          e.amountMinorUnits === orig.amountMinorUnits &&
          e.currency === orig.currency &&
          sameMultiset(e.cashLegs.map(legKey), orig.cashLegs.map(negate).map(legKey)) &&
          e.classification.restrictionId === orig.classification.restrictionId &&
          e.classification.flow === orig.classification.flow;
        if (!exact) add("reversal", e, `a reversal has the original's amount, currency, restriction and flow, with exactly opposite legs (event ${orig.eventSequence})`);
        reversed.set(orig.eventId, e);
      } else if (e.type === "reclassification") {
        const c = e.classification;
        const o = orig.classification;
        // It moves no cash (flow "none", by schema) and changes the category only; a change of restriction is a reversal and replacement.
        if (c.restrictionId !== o.restrictionId) add("reclassification", e, "in v1 a reclassification changes the category only; a change of restriction is a reversal and replacement");
        if (c.categoryId === o.categoryId && c.categoryVersion === o.categoryVersion) add("reclassification", e, "a reclassification changes the category");
      } else if (e.correction.kind === "replacement") {
        if (orig.type !== e.type) add("replacement", e, `a replacement is the same type as the event it replaces (${orig.type})`);
        if (!reversed.has(orig.eventId)) add("replacement", e, `event ${orig.eventSequence} must be reversed before it is replaced, or the replacement would count twice`);
      }
    }
    byId.set(e.eventId, e);
  });
  return out;
}
