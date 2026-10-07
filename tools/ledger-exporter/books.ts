import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseMinor } from "../../packages/ledger-proof/src/arithmetic.ts";
import { DEMO_LABEL, ENVIRONMENTS, SCHEMA_IDS } from "../../packages/ledger-proof/src/constants.ts";
import type { BundleInput } from "../../packages/ledger-proof/src/bundle.ts";
import type { CashLeg, PublicEvent } from "../../packages/ledger-proof/src/types.ts";

/**
 * Private books in, public projection out (PRD MR-15 to MR-21).
 *
 * The books are a double-entry journal: every entry's debits equal its
 * credits, in one currency. They are the system of record; this module only
 * projects them. A cash account maps to a public bucket ID; every other
 * account maps to a versioned public category and a flow (operating or
 * financing). Source entry IDs, account numbers and account names never
 * reach the public files: the public event ID and sequence come from a
 * private allocation registry, assigned once at first publication and never
 * reused (MR-28).
 *
 * Corrections append. The original entry stays; a reversal entry mirrors it
 * exactly, and a replacement entry follows (MR-21).
 */
const int = z.string().regex(/^(?:0|[1-9][0-9]*)$/);
const signed = z.string().regex(/^(?:0|-?[1-9][0-9]*)$/);
const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
const date = z.iso.date();

const Account = z.discriminatedUnion("kind", [
  z.object({ account: z.string(), name: z.string(), kind: z.literal("cash"), bucketId: slug, bucketLabel: z.string(), currency: z.string() }).strict(),
  z.object({ account: z.string(), name: z.string(), kind: z.literal("out-of-scope"), categoryId: slug, categoryVersion: int }).strict(),
  z
    .object({
      account: z.string(),
      name: z.string(),
      kind: z.enum(["revenue", "expense", "liability"]),
      categoryId: slug,
      categoryVersion: int,
      flow: z.enum(["operating", "financing"]),
    })
    .strict(),
]);
type Account = z.infer<typeof Account>;

const Line = z.union([z.object({ account: z.string(), debit: int }).strict(), z.object({ account: z.string(), credit: int }).strict()]);

const Entry = z
  .object({
    sourceId: z.string().min(1),
    date,
    kind: z.enum(["receipt", "disbursement", "transfer", "reversal", "replacement", "reclassification", "reconciliation", "attestation"]),
    programId: slug,
    restrictionId: slug.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    purpose: z.string().min(1).max(500),
    approvalRefs: z.array(slug).default([]),
    conflictRefs: z.array(slug).default([]),
    corrects: z.string().optional(),
    reason: z.string().max(500).optional(),
    newCategoryAccount: z.string().optional(),
    lines: z.array(Line).default([]),
  })
  .strict();
type Entry = z.infer<typeof Entry>;

export const Books = z
  .object({
    environment: z.enum(ENVIRONMENTS),
    entity: z.object({ entityId: slug, label: z.string() }).strict(),
    period: z
      .object({ periodId: z.string().regex(/^[0-9]{4}-Q[1-4]$/), start: date, end: date, cutoff: z.string(), publishedAt: z.string(), commitmentSequence: int })
      .strict(),
    authoritySet: slug,
    accounts: z.array(Account).min(1),
    openingBalances: z.record(z.string(), signed),
    restrictedFunds: z.array(z.object({ restrictionId: slug, label: z.string(), currency: z.string(), opening: signed }).strict()),
    excluded: z.array(z.object({ description: z.string(), reason: z.string() }).strict()),
    reconciliation: z.object({ status: z.enum(["not-reconciled", "partially-reconciled", "bank-reconciled"]), date: date.nullable(), coverage: z.string() }).strict(),
    scopeStatement: z.string(),
    summaryStatement: z.string(),
    manifestStatement: z.string(),
    exceptions: z.array(z.unknown()),
    budgets: z.array(z.unknown()),
    approvals: z.array(z.unknown()),
    entries: z.array(Entry).min(1),
  })
  .strict();
export type Books = z.infer<typeof Books>;

/** Private: source entry ID → the public ID and sequence it was given at first publication. */
export const Allocations = z.record(z.string(), z.object({ eventId: z.uuid({ version: "v4" }), eventSequence: int }).strict());
export type Allocations = z.infer<typeof Allocations>;

export class BooksError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`books rejected:\n- ${issues.join("\n- ")}`);
    this.name = "BooksError";
    this.issues = issues;
  }
}

const amountOf = (l: z.infer<typeof Line>) => ("debit" in l ? parseMinor(l.debit) : -parseMinor(l.credit));

/**
 * Give every entry without a public ID a new random UUID and the next
 * sequence. Existing allocations never change, so a re-export keeps every
 * event's identity and order.
 */
export function allocate(books: Books, prior: Allocations): { allocations: Allocations; added: string[] } {
  const allocations = { ...prior };
  const added: string[] = [];
  let next = Math.max(0, ...Object.values(prior).map((a) => Number(a.eventSequence))) + 1;
  for (const e of books.entries) {
    if (allocations[e.sourceId]) continue;
    allocations[e.sourceId] = { eventId: randomUUID(), eventSequence: String(next++) };
    added.push(e.sourceId);
  }
  return { allocations, added };
}

/** Check the journal and project it to public events, in sequence order. */
export function projectBooks(books: Books, allocations: Allocations): BundleInput {
  const issues: string[] = [];
  const accounts = new Map<string, Account>(books.accounts.map((a) => [a.account, a]));
  const entries = new Map<string, Entry>();
  const events: PublicEvent[] = [];
  const env = { environment: books.environment };
  const seenIds = new Set<string>();

  for (const e of books.entries) {
    const where = `entry ${e.sourceId}`;
    if (entries.has(e.sourceId)) issues.push(`${where}: duplicate source ID`);
    entries.set(e.sourceId, e);
    const alloc = allocations[e.sourceId];
    if (!alloc) {
      issues.push(`${where}: no public ID allocated (run with --allocate)`);
      continue;
    }
    if (seenIds.has(alloc.eventId)) issues.push(`${where}: public ID reused`);
    seenIds.add(alloc.eventId);

    // Double entry: debits equal credits, every account known, one currency.
    let net = 0n;
    for (const l of e.lines) {
      const a = accounts.get(l.account);
      if (!a) issues.push(`${where}: unknown account`);
      else if (a.kind === "cash" && a.currency !== e.currency) issues.push(`${where}: cash account in ${a.currency}, entry in ${e.currency}`);
      net += amountOf(l);
    }
    if (net !== 0n) issues.push(`${where}: debits and credits differ by ${net}`);

    const cashLines = e.lines.filter((l) => accounts.get(l.account)?.kind === "cash");
    const otherLines = e.lines.filter((l) => accounts.get(l.account)?.kind !== "cash");
    const boundaryKind = e.kind === "transfer" ? (otherLines.some((l) => accounts.get(l.account)?.kind === "out-of-scope") ? "boundary" : "internal") : "external";
    const legs: CashLeg[] = cashLines.map((l, i) => {
      const a = accounts.get(l.account) as Extract<Account, { kind: "cash" }>;
      return { legId: `leg-${i + 1}`, bucketId: a.bucketId, currency: a.currency, deltaMinorUnits: amountOf(l).toString(), boundary: boundaryKind };
    });
    const legSum = legs.reduce((s, l) => s + BigInt(l.deltaMinorUnits), 0n);

    let type: PublicEvent["type"];
    let classification: PublicEvent["classification"];
    let amount: bigint | null = null;
    let correction: PublicEvent["correction"];
    const original = e.corrects ? books.entries.find((x) => x.sourceId === e.corrects) : undefined;
    if (e.corrects && !original) issues.push(`${where}: corrects an unknown entry`);
    const originalId = original ? allocations[original.sourceId]?.eventId : undefined;
    const category = (lines: typeof e.lines) =>
      lines.map((l) => accounts.get(l.account)).find((x) => x && x.kind !== "cash" && x.kind !== "out-of-scope") as Extract<Account, { flow: string }> | undefined;

    switch (e.kind) {
      case "receipt":
      case "disbursement":
      case "replacement":
      case "reversal": {
        const source = e.kind === "reversal" ? original : e;
        const cat = source ? category(source.lines) : undefined;
        if (!cat) {
          issues.push(`${where}: no category account`);
          continue;
        }
        type = e.kind === "replacement" ? (legSum > 0n ? "receipt" : "disbursement") : e.kind;
        amount = legSum < 0n ? -legSum : legSum;
        classification = { categoryId: cat.categoryId, categoryVersion: cat.categoryVersion, flow: cat.flow, restrictionId: e.restrictionId, basis: "cash" };
        if (e.kind === "reversal" || e.kind === "replacement") {
          if (!originalId || !e.reason) issues.push(`${where}: a ${e.kind} names the entry it corrects and why`);
          correction = { originalEventId: originalId ?? "", kind: e.kind, reason: e.reason ?? "" };
        }
        if (e.kind === "reversal" && original) {
          // The journal reversal must mirror the original exactly.
          const mirror = original.lines.map((l) => ("debit" in l ? { account: l.account, credit: l.debit } : { account: l.account, debit: l.credit }));
          const key = (ls: typeof e.lines) => ls.map((l) => JSON.stringify(l)).sort().join("|");
          if (key(mirror) !== key(e.lines)) issues.push(`${where}: a reversal mirrors every line of ${original.sourceId}`);
        }
        break;
      }
      case "transfer":
        type = "transfer";
        amount = legs.reduce((m, l) => (BigInt(l.deltaMinorUnits) > m ? BigInt(l.deltaMinorUnits) : m), 0n);
        if (boundaryKind === "boundary") amount = legSum < 0n ? -legSum : legSum;
        classification = { categoryId: boundaryKind === "internal" ? "internal-transfer" : "boundary-transfer", categoryVersion: "1", flow: "transfer", restrictionId: null, basis: "cash" };
        break;
      case "reclassification": {
        const target = e.newCategoryAccount ? accounts.get(e.newCategoryAccount) : undefined;
        const orig = original ? category(original.lines) : undefined;
        if (!target || target.kind === "cash" || target.kind === "out-of-scope" || !orig) {
          issues.push(`${where}: a reclassification names the original and a new category account`);
          continue;
        }
        type = "reclassification";
        classification = { categoryId: target.categoryId, categoryVersion: target.categoryVersion, flow: "none", restrictionId: original?.restrictionId ?? null, basis: "cash" };
        correction = { originalEventId: originalId ?? "", kind: "reclassification", reason: e.reason ?? "" };
        break;
      }
      default:
        type = e.kind;
        classification = { categoryId: e.kind, categoryVersion: "1", flow: "none", restrictionId: null, basis: "cash" };
    }
    if (e.lines.length && ["reclassification", "reconciliation", "attestation"].includes(e.kind)) issues.push(`${where}: a ${e.kind} moves no cash`);

    const ev: PublicEvent = {
      schema: SCHEMA_IDS.event,
      ...env,
      ...(books.environment === "synthetic-demo" ? { demoLabel: DEMO_LABEL } : {}),
      eventId: alloc.eventId,
      entityId: books.entity.entityId,
      periodId: books.period.periodId,
      programId: e.programId,
      eventSequence: alloc.eventSequence,
      effectiveDate: e.date,
      publishedAt: books.period.publishedAt,
      type,
      ...(amount !== null ? { amountMinorUnits: amount.toString(), currency: e.currency } : {}),
      ...(type === "transfer" ? { transferKind: boundaryKind as "internal" | "boundary" } : {}),
      cashLegs: legs,
      classification,
      purpose: { text: e.purpose },
      controls: { approvalRefs: e.approvalRefs, conflictRefs: e.conflictRefs, supportingCommitments: [] },
      ...(correction ? { correction } : {}),
      evidence: { reportRefs: [] },
    };
    events.push(ev);
  }

  // Opening balances: per public bucket, from the cash accounts.
  const bucketOpenings = books.accounts
    .filter((a): a is Extract<Account, { kind: "cash" }> => a.kind === "cash")
    .map((a) => ({ bucketId: a.bucketId, currency: a.currency, opening: books.openingBalances[a.account] ?? "0" }));
  for (const k of Object.keys(books.openingBalances)) if (accounts.get(k)?.kind !== "cash") issues.push(`opening balance for a non-cash account`);

  if (issues.length) throw new BooksError(issues);
  events.sort((a, b) => Number(a.eventSequence) - Number(b.eventSequence));

  const cash = books.accounts.filter((a): a is Extract<Account, { kind: "cash" }> => a.kind === "cash");
  return {
    environment: books.environment,
    entityId: books.entity.entityId,
    periodId: books.period.periodId,
    commitmentSequence: books.period.commitmentSequence,
    priorRoot: null,
    amendmentOf: null,
    authoritySet: books.authoritySet,
    archiveLocations: [],
    manifestStatement: books.manifestStatement,
    summaryStatement: books.summaryStatement,
    events,
    openings: { buckets: bucketOpenings, restrictedFunds: books.restrictedFunds.map((f) => ({ restrictionId: f.restrictionId, currency: f.currency, opening: f.opening })) },
    scope: {
      entityId: books.entity.entityId,
      entityLabel: books.entity.label,
      periodId: books.period.periodId,
      periodStart: books.period.start,
      periodEnd: books.period.end,
      cutoff: books.period.cutoff,
      basis: "cash",
      buckets: cash.map((a) => ({ bucketId: a.bucketId, label: a.bucketLabel, currency: a.currency })),
      restrictedFunds: books.restrictedFunds.map((f) => ({ restrictionId: f.restrictionId, label: f.label })),
      excluded: books.excluded,
      reconciliation: books.reconciliation,
      statement: books.scopeStatement,
    },
    publishedAt: books.period.publishedAt,
    exceptions: books.exceptions as BundleInput["exceptions"],
    budgets: books.budgets,
    approvals: books.approvals,
  };
}
