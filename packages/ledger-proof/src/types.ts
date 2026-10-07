import type { Environment, EventType } from "./constants.ts";

/** Shapes of the v1 public files. The JSON Schemas in ../schemas/v1 are authoritative. */
export type Envelope = { schema: string; environment: Environment; demoLabel?: string };

export type CashLeg = {
  legId: string;
  bucketId: string;
  currency: string;
  /** Signed integer minor units, as a canonical decimal string. */
  deltaMinorUnits: string;
  boundary: "external" | "internal" | "boundary";
};

export type PublicEvent = Envelope & {
  eventId: string;
  entityId: string;
  periodId: string;
  programId: string;
  eventSequence: string;
  effectiveDate: string;
  publishedAt: string;
  type: EventType;
  amountMinorUnits?: string;
  currency?: string;
  transferKind?: "internal" | "boundary";
  cashLegs: CashLeg[];
  classification: { categoryId: string; categoryVersion: string; flow: "operating" | "financing" | "transfer" | "none"; restrictionId: string | null; basis: "cash" };
  purpose: { text: string; redactionReason?: string };
  controls: { approvalRefs: string[]; conflictRefs: string[]; supportingCommitments: string[] };
  correction?: { originalEventId: string; kind: "reversal" | "replacement" | "reclassification"; reason: string; amendmentRef?: string };
  evidence: { reportRefs: string[]; nativePayment?: { network: string; signature: string; payeeKind: string } };
};

export type CurrencyLine = {
  currency: string;
  opening: string;
  receipts: { operating: string; financing: string };
  disbursements: { operating: string; financing: string };
  reversalsNet: string;
  transfers: { internalNet: string; boundaryNet: string };
  closing: string;
};

export type FundLine = { restrictionId: string; currency: string; opening: string; receipts: string; disbursements: string; reversalsNet: string; closing: string };
export type BucketLine = { bucketId: string; currency: string; opening: string; closing: string };

export type PeriodSummary = Envelope & {
  entityId: string;
  periodId: string;
  basis: "cash";
  currencies: CurrencyLine[];
  buckets: BucketLine[];
  restrictedFunds: FundLine[];
  counts: Record<"events" | "financialEvents" | EventType, string>;
  statement: string;
};

export type ScopeStatement = Envelope & {
  entityId: string;
  entityLabel: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  cutoff: string;
  basis: "cash";
  buckets: { bucketId: string; label: string; currency: string }[];
  restrictedFunds: { restrictionId: string; label: string }[];
  excluded: { description: string; reason: string }[];
  reconciliation: { status: "not-reconciled" | "partially-reconciled" | "bank-reconciled"; date: string | null; coverage: string };
  statement: string;
};

export type ManifestFile = { path: string; role: string; sha256: string; bytes: string };

export type Manifest = Envelope & {
  entityId: string;
  periodId: string;
  commitmentSequence: string;
  basis: "cash";
  periodStart: string;
  periodEnd: string;
  cutoff: string;
  publishedAt: string;
  priorRoot: string | null;
  amendmentOf: string | null;
  versions: { event: string; currencies: string; canonicalization: string; hash: string; merkle: string };
  events: { count: string; root: string; register: string };
  scopeDigest: string;
  files: ManifestFile[];
  authoritySet: string;
  archiveLocations: string[];
  statement: string;
};

export type ProofEntry = { eventId: string; eventSequence: string; leafIndex: string; leaf: string; path: { side: "left" | "right"; hash: string }[] };
export type Proofs = Envelope & { entityId: string; periodId: string; algorithm: string; leafCount: string; root: string; proofs: ProofEntry[] };

export type ExceptionRecord = {
  exceptionId: string;
  status: "open" | "resolved";
  kind: string;
  description: string;
  scope: string;
  ownerRole: string;
  openedDate: string;
  resolutionRef: string | null;
};
export type Exceptions = Envelope & { entityId: string; periodId: string; exceptions: ExceptionRecord[] };
