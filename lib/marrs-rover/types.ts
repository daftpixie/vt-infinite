import type { Exceptions, Manifest, PeriodSummary, Proofs, PublicEvent, ScopeStatement } from "@/packages/ledger-proof/src/types.ts";

/**
 * The public files of one sealed bundle, after every check in ./bundles.ts
 * has passed. The JSON Schemas in packages/ledger-proof/schemas/v1 are
 * authoritative; these types describe what the pages read.
 */
export type Budget = {
  budgetId: string;
  version: string;
  programId: string;
  approvedDate: string;
  approvalRef: string;
  responsibleRole: string;
  restrictionId: string | null;
  currency: string;
  lines: { categoryId: string; amountMinorUnits: string }[];
  amendments: { version: string; date: string; approvalRef: string; reason: string }[];
  varianceNote: string;
};

export type Approval = {
  approvalRef: string;
  kind: "spending" | "budget" | "publication" | "conflict-disclosure";
  role: string;
  date: string;
  scope: string;
};

export type Correction = {
  originalEventId: string;
  correctingEvents: { eventId: string; kind: "reversal" | "replacement" | "reclassification"; reason: string }[];
};

/** One file the manifest lists, with the bytes the site serves for it. */
export type BundleFile = { path: string; role: string; sha256: string; bytes: number };

export type LoadedBundle = {
  /** The SHA-256 of manifest.json, which is also the bundle folder's name. */
  digest: string;
  manifest: Manifest;
  events: PublicEvent[];
  summary: PeriodSummary;
  scope: ScopeStatement;
  proofs: Proofs;
  exceptions: Exceptions;
  corrections: Correction[];
  budgets: Budget[];
  approvals: Approval[];
  /** manifest.json first, then every file the manifest lists, in its order. */
  files: BundleFile[];
  currencyExponents: Record<string, number>;
};

/** A bundle that failed a check. `reason` is plain words; it never quotes file contents. */
export type FailedBundle = { entityId: string; periodId: string; digest: string; reason: string };

export type BundleResult = { ok: true; bundle: LoadedBundle } | ({ ok: false } & FailedBundle);
