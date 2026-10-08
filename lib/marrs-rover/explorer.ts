import { parseMinor } from "@/packages/ledger-proof/src/arithmetic.ts";
import type { PublicEvent } from "@/packages/ledger-proof/src/types.ts";
import { DEMO_ENTITY_ID } from "@/lib/flags";
import { listBundles, loadBundle, type BundleRef } from "./bundles";
import { formatMovement } from "./format";
import type { BundleResult, FailedBundle, LoadedBundle } from "./types";

/**
 * The explorer's index over sealed bundles (PRD MR-9, MR-11). The index is
 * a convenience for choosing what to show; it is never a proof input. Each
 * page reads the sealed files themselves through loadBundle, which refuses
 * any bundle that fails a check.
 */
export type Publications = { ok: LoadedBundle[]; failed: FailedBundle[] };

export function publications(): Publications {
  const results: BundleResult[] = listBundles().map(loadBundle);
  return {
    ok: results.flatMap((r) => (r.ok ? [r.bundle] : [])),
    failed: results.flatMap((r) => (r.ok ? [] : [{ entityId: r.entityId, periodId: r.periodId, digest: r.digest, reason: r.reason }])),
  };
}

const byCommitment = (a: LoadedBundle, b: LoadedBundle) => Number(parseMinor(b.manifest.commitmentSequence) - parseMinor(a.manifest.commitmentSequence));

/** The entities with a verified publication. Only the demo entity is ever read. */
export function entities(p: Publications): string[] {
  return [...new Set(p.ok.map((b) => b.manifest.entityId))].sort();
}

/** Periods of an entity, newest first. */
export function periods(p: Publications, entityId: string): string[] {
  return [...new Set(p.ok.filter((b) => b.manifest.entityId === entityId).map((b) => b.manifest.periodId))].sort().reverse();
}

/** The latest sealed publication for a period (the highest commitment sequence), and any earlier ones. */
export function periodBundles(p: Publications, entityId: string, periodId: string): LoadedBundle[] {
  return p.ok.filter((b) => b.manifest.entityId === entityId && b.manifest.periodId === periodId).sort(byCommitment);
}

/** Failures for a period, so a page can say a publication was withheld rather than pretend it does not exist. */
export function periodFailures(p: Publications, entityId: string, periodId: string): FailedBundle[] {
  return p.failed.filter((f) => f.entityId === entityId && f.periodId === periodId);
}

/** The default selection: the demo entity's newest period. */
export function defaultSelection(p: Publications): { entityId: string; periodId: string } | null {
  const periodId = periods(p, DEMO_ENTITY_ID)[0];
  return periodId ? { entityId: DEMO_ENTITY_ID, periodId } : null;
}

export function findBundleByDigest(p: Publications, entityId: string, digest: string): LoadedBundle | null {
  return p.ok.find((b) => b.manifest.entityId === entityId && b.digest === digest) ?? null;
}

/** An event in the latest publication that contains it. */
export function findEvent(p: Publications, entityId: string, eventId: string): { bundle: LoadedBundle; event: PublicEvent; index: number } | null {
  for (const bundle of [...p.ok].filter((b) => b.manifest.entityId === entityId).sort(byCommitment)) {
    const index = bundle.events.findIndex((e) => e.eventId === eventId);
    if (index >= 0) return { bundle, event: bundle.events[index] as PublicEvent, index };
  }
  return null;
}

export function findBudget(p: Publications, entityId: string, budgetId: string) {
  for (const bundle of [...p.ok].filter((b) => b.manifest.entityId === entityId).sort(byCommitment)) {
    const budget = bundle.budgets.find((x) => x.budgetId === budgetId);
    if (budget) return { bundle, budget };
  }
  return null;
}

export type { BundleRef };

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const TYPE_LABELS: Record<PublicEvent["type"], string> = {
  receipt: "Receipt (cash in)",
  disbursement: "Disbursement (cash out)",
  transfer: "Transfer",
  reversal: "Reversal",
  reclassification: "Reclassification",
  reconciliation: "Reconciliation statement",
  attestation: "Attestation",
};

export const ENVIRONMENT_LABELS: Record<string, string> = {
  "synthetic-demo": "Synthetic demo",
  "local-prototype": "Local prototype",
  devnet: "Devnet",
  "mainnet-pilot": "Real mainnet pilot",
};

export const RECONCILIATION_LABELS = {
  "not-reconciled": "Not reconciled",
  "partially-reconciled": "Partially reconciled",
  "bank-reconciled": "Bank-reconciled",
} as const;

export const FLOW_LABELS: Record<PublicEvent["classification"]["flow"], string> = {
  operating: "Operating",
  financing: "Financing (not income)",
  transfer: "Transfer",
  none: "No cash movement",
};

/** IDs are public, disclosure-safe slugs; they are shown as written, with spaces for hyphens. */
export const readable = (id: string) => id.replace(/-/g, " ");

export function bucketLabel(b: LoadedBundle, bucketId: string): string {
  return b.scope.buckets.find((x) => x.bucketId === bucketId)?.label ?? bucketId;
}

export function restrictionLabel(b: LoadedBundle, restrictionId: string | null): string {
  if (!restrictionId) return "Unrestricted";
  return b.scope.restrictedFunds.find((x) => x.restrictionId === restrictionId)?.label ?? restrictionId;
}

/** Net cash movement of an event: the sum of its legs (an internal transfer nets to zero). */
export const netDelta = (e: PublicEvent): bigint => e.cashLegs.reduce((a, l) => a + parseMinor(l.deltaMinorUnits), 0n);

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */

export type CorrectionStatus = "corrected" | "correcting" | "none";

export function correctionStatus(b: LoadedBundle, e: PublicEvent): CorrectionStatus {
  if (e.correction) return "correcting";
  if (b.corrections.some((c) => c.originalEventId === e.eventId)) return "corrected";
  return "none";
}

export const CORRECTION_LABELS: Record<CorrectionStatus, string> = {
  corrected: "Corrected by a later entry",
  correcting: "A correcting entry",
  none: "Not corrected",
};

/* ------------------------------------------------------------------ */
/* Register filters (MR-11): they change the view, never the register.  */
/* ------------------------------------------------------------------ */

export const PAGE_SIZE = 10;

export type RegisterFilters = {
  program: string;
  category: string;
  currency: string;
  restriction: string;
  type: string;
  correction: string;
  q: string;
  page: number;
};

export type FilterOptions = Record<"program" | "category" | "currency" | "restriction" | "type", string[]>;

export function filterOptions(b: LoadedBundle): FilterOptions {
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return {
    program: uniq(b.events.map((e) => e.programId)),
    category: uniq(b.events.map((e) => e.classification.categoryId)),
    currency: uniq(b.events.flatMap((e) => (e.currency ? [e.currency] : e.cashLegs.map((l) => l.currency)))),
    restriction: uniq(b.events.map((e) => e.classification.restrictionId ?? "unrestricted")),
    type: uniq(b.events.map((e) => e.type)),
  };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Read filters from a query string; anything not offered is ignored rather than trusted. */
export function parseFilters(b: LoadedBundle, query: Record<string, string | string[] | undefined>): RegisterFilters {
  const opts = filterOptions(b);
  const pick = (key: keyof FilterOptions) => {
    const v = one(query[key]);
    return opts[key].includes(v) ? v : "";
  };
  const correction = one(query.correction);
  const page = Number.parseInt(one(query.page), 10);
  return {
    program: pick("program"),
    category: pick("category"),
    currency: pick("currency"),
    restriction: pick("restriction"),
    type: pick("type"),
    correction: ["corrected", "correcting", "none"].includes(correction) ? correction : "",
    q: one(query.q).slice(0, 100).trim(),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function isFiltered(f: RegisterFilters): boolean {
  return Boolean(f.program || f.category || f.currency || f.restriction || f.type || f.correction || f.q);
}

/** Search covers public IDs and the published purpose text only (MR-11). */
export function applyFilters(b: LoadedBundle, f: RegisterFilters): PublicEvent[] {
  const q = f.q.toLowerCase();
  return b.events.filter(
    (e) =>
      (!f.program || e.programId === f.program) &&
      (!f.category || e.classification.categoryId === f.category) &&
      (!f.currency || e.currency === f.currency || e.cashLegs.some((l) => l.currency === f.currency)) &&
      (!f.restriction || (e.classification.restrictionId ?? "unrestricted") === f.restriction) &&
      (!f.type || e.type === f.type) &&
      (!f.correction || correctionStatus(b, e) === f.correction) &&
      (!q || e.eventId.includes(q) || e.eventSequence === q || e.purpose.text.toLowerCase().includes(q)),
  );
}

/** Per-currency net cash movement of a set of events; currencies are never added together. */
export function netByCurrency(events: PublicEvent[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const e of events) for (const l of e.cashLegs) out.set(l.currency, (out.get(l.currency) ?? 0n) + parseMinor(l.deltaMinorUnits));
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * An event's cash movement in words, per currency. A single-currency event
 * reads "$450.00 out"; an event whose legs span currencies gets one figure
 * per currency, never one sum labelled with the first leg's currency.
 */
export function eventMovement(e: PublicEvent, exponents: Record<string, number>): string {
  const per = [...netByCurrency([e])];
  if (per.length === 0) return "no cash movement";
  if (per.length === 1) return formatMovement(per[0]![1], per[0]![0], exponents);
  return per.map(([c, n]) => `${formatMovement(n, c, exponents)} (${c})`).join("; ");
}

/** Query string for a filter state, dropping empty values. */
export function filterQuery(f: Partial<RegisterFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (k === "page" ? Number(v) > 1 : v) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ */
/* Budgets (MR-10, MR-13)                                              */
/* ------------------------------------------------------------------ */

/**
 * Net disbursed for a program and category in the period, from the full
 * register: disbursements, less reversals of them. Restricted and
 * unrestricted spending both count; currencies are kept apart.
 */
export function netDisbursed(b: LoadedBundle, programId: string, categoryId: string, currency: string): bigint {
  let total = 0n;
  for (const e of b.events) {
    if (e.programId !== programId || e.classification.categoryId !== categoryId || e.currency !== currency) continue;
    if (e.type === "disbursement") total += parseMinor(e.amountMinorUnits as string);
    if (e.type === "reversal") total -= netDelta(e);
  }
  return total;
}
