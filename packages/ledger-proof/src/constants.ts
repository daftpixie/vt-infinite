/**
 * Fixed public strings for Marrs Rover v1 files.
 *
 * DEMO_LABEL is PRD MR-5's label, set with the brand reference's spaced em
 * dash (§05) as in the public specification. Every synthetic file carries it.
 */
export const DEMO_LABEL = "Demo data — not VT Infinite's financial records.";

export const ENVIRONMENTS = ["synthetic-demo", "local-prototype", "devnet", "mainnet-pilot"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const SCHEMA_IDS = {
  event: "marrs-rover.event.1",
  summary: "marrs-rover.period-summary.1",
  scope: "marrs-rover.scope.1",
  manifest: "marrs-rover.manifest.1",
  proofs: "marrs-rover.proofs.1",
  exceptions: "marrs-rover.exceptions.1",
  corrections: "marrs-rover.corrections.1",
  budgets: "marrs-rover.budgets.1",
  approvals: "marrs-rover.approvals.1",
  schemas: "marrs-rover.schemas.1",
} as const;
export type SchemaName = keyof typeof SCHEMA_IDS;

export const CANONICALIZATION = "RFC8785";
export const HASH = "SHA-256";

/** Event types (PRD MR-28). The first four move cash; the rest never do. */
export const FINANCIAL_TYPES = ["receipt", "disbursement", "transfer", "reversal"] as const;
export const NON_FINANCIAL_TYPES = ["reclassification", "reconciliation", "attestation"] as const;
export type EventType = (typeof FINANCIAL_TYPES)[number] | (typeof NON_FINANCIAL_TYPES)[number];

/** The bundle's file names. The manifest lists every other file with its digest. */
export const FILES = {
  manifest: "manifest.json",
  register: "register.jsonl",
  csv: "register.csv",
  summary: "summary.json",
  scope: "scope.json",
  proofs: "proofs.json",
  exceptions: "exceptions.json",
  corrections: "corrections.json",
  budgets: "budgets.json",
  approvals: "approvals.json",
  schemas: "schemas.json",
  instructions: "verify.md",
} as const;
