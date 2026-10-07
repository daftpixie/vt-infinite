import { balanceIssues, computeTotals, type Openings } from "./arithmetic.ts";
import { canonicalBytes } from "./canonical.ts";
import { CANONICALIZATION, DEMO_LABEL, FILES, HASH, SCHEMA_IDS, type Environment, type SchemaName } from "./constants.ts";
import { registerIssues } from "./invariants.ts";
import { buildTree, inclusionPath, MERKLE_ALGORITHM, sha256Hex } from "./merkle.ts";
import { readCurrencies, readSchema, schemaIssues, SCHEMA_FILES } from "./schemas.ts";
import type { Exceptions, Manifest, PeriodSummary, Proofs, PublicEvent, ScopeStatement } from "./types.ts";

/**
 * Seal a publication bundle (PRD MR-29 to MR-31). Every JSON file is written
 * as its exact RFC 8785 bytes; the register is one canonical event per line.
 * The manifest lists every other file with its SHA-256 and size, and the
 * bundle is addressed by the SHA-256 of the manifest's bytes. Nothing is
 * sealed unless every schema, register rule and balance check passes.
 */
export type BundleInput = {
  environment: Environment;
  entityId: string;
  periodId: string;
  commitmentSequence: string;
  priorRoot: string | null;
  amendmentOf: string | null;
  authoritySet: string;
  archiveLocations: string[];
  manifestStatement: string;
  summaryStatement: string;
  events: PublicEvent[];
  openings: Openings;
  scope: Omit<ScopeStatement, "schema" | "environment" | "demoLabel">;
  publishedAt: string;
  exceptions: Exceptions["exceptions"];
  budgets: unknown[];
  approvals: unknown[];
};

export type SealedBundle = { digest: string; files: Map<string, Uint8Array>; manifest: Manifest; root: string };

export class SealError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`bundle not sealed:\n- ${issues.join("\n- ")}`);
    this.name = "SealError";
    this.issues = issues;
  }
}

const enc = new TextEncoder();

/** CSV is a convenience view (MR-30): text cells that a spreadsheet would run as a formula are prefixed with an apostrophe. */
export function csvCell(value: string, numeric = false): string {
  let v = value;
  if (!numeric && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (numeric && !/^(?:0|-?[1-9][0-9]*)$/.test(v) && v !== "") throw new TypeError(`not an integer: ${v}`);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const CSV_COLUMNS = ["label", "eventSequence", "eventId", "effectiveDate", "type", "programId", "categoryId", "restrictionId", "currency", "amountMinorUnits", "netCashDeltaMinorUnits", "correctionOf", "purpose"] as const;
const NUMERIC = new Set(["eventSequence", "amountMinorUnits", "netCashDeltaMinorUnits"]);

export function registerCsv(events: PublicEvent[], label: string): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    const net = e.cashLegs.reduce((a, l) => a + BigInt(l.deltaMinorUnits), 0n).toString();
    const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
      label,
      eventSequence: e.eventSequence,
      eventId: e.eventId,
      effectiveDate: e.effectiveDate,
      type: e.type,
      programId: e.programId,
      categoryId: e.classification.categoryId,
      restrictionId: e.classification.restrictionId ?? "",
      currency: e.currency ?? "",
      amountMinorUnits: e.amountMinorUnits ?? "",
      netCashDeltaMinorUnits: e.cashLegs.length ? net : "",
      correctionOf: e.correction?.originalEventId ?? "",
      purpose: e.purpose.text,
    };
    rows.push(CSV_COLUMNS.map((c) => csvCell(cells[c], NUMERIC.has(c))).join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}

export function verifyInstructions(label: string | undefined): string {
  return [
    ...(label ? [`**${label}**`, ""] : []),
    "# Verifying this bundle",
    "",
    "This folder is one sealed Marrs Rover publication. Its folder name is the SHA-256 of `manifest.json`. The manifest lists every other file with its SHA-256 and size.",
    "",
    "To check it without the website, run the standalone verifier from the vt-infinite repository (`tools/ledger-verifier`, Node.js 22 or later, no dependencies):",
    "",
    "    node tools/ledger-verifier/verify.mjs <path to this folder>",
    "",
    "It reports each result separately: the bundle, the inclusion proofs, the chain commitment, the balance checks, reconciliation evidence and any independent report.",
    "",
    "What a passing result means: the files match the manifest, every event is included under the published root, and the totals add up. It does not show that the source records are genuine, that every account is included, that amounts are classified correctly, or that anyone has audited them.",
    "",
  ].join("\n");
}

export function sealBundle(input: BundleInput): SealedBundle {
  const demo = input.environment === "synthetic-demo";
  const env = { environment: input.environment, ...(demo ? { demoLabel: DEMO_LABEL } : {}) };
  const issues: string[] = [];
  const currencies = readCurrencies();
  const ids = { entityId: input.entityId, periodId: input.periodId };

  // Events: schema, then the register rules.
  input.events.forEach((e) => schemaIssues("event", e).forEach((i) => issues.push(`event ${e.eventSequence} ${i.path}: ${i.message}`)));
  registerIssues(input.events, {
    ...ids,
    periodStart: input.scope.periodStart,
    periodEnd: input.scope.periodEnd,
    publishedAt: input.publishedAt,
    scope: input.scope,
    currencies,
  }).forEach((i) => issues.push(`${i.at} [${i.rule}]: ${i.message}`));
  if (issues.length) throw new SealError(issues);

  const totals = computeTotals(input.events, input.openings);
  balanceIssues(totals).forEach((m) => issues.push(`balance: ${m}`));

  const docs: Partial<Record<SchemaName, object>> = {
    summary: { schema: SCHEMA_IDS.summary, ...env, ...ids, basis: "cash", ...totals, statement: input.summaryStatement } satisfies PeriodSummary,
    scope: { schema: SCHEMA_IDS.scope, ...env, ...input.scope } satisfies ScopeStatement,
    exceptions: { schema: SCHEMA_IDS.exceptions, ...env, ...ids, exceptions: input.exceptions },
    budgets: { schema: SCHEMA_IDS.budgets, ...env, ...ids, budgets: input.budgets },
    approvals: { schema: SCHEMA_IDS.approvals, ...env, ...ids, approvals: input.approvals },
  };

  // Correction history, derived from the register (MR-21).
  const history = new Map<string, { eventId: string; kind: string; reason: string }[]>();
  for (const e of input.events) {
    if (!e.correction) continue;
    const list = history.get(e.correction.originalEventId) ?? [];
    list.push({ eventId: e.eventId, kind: e.correction.kind, reason: e.correction.reason });
    history.set(e.correction.originalEventId, list);
  }
  docs.corrections = { schema: SCHEMA_IDS.corrections, ...env, ...ids, corrections: [...history].map(([originalEventId, correctingEvents]) => ({ originalEventId, correctingEvents })) };

  // Proofs over the canonical event bytes, in sequence order.
  const eventBytes = input.events.map((e) => canonicalBytes(e));
  const tree = buildTree(eventBytes);
  docs.proofs = {
    schema: SCHEMA_IDS.proofs,
    ...env,
    ...ids,
    algorithm: MERKLE_ALGORITHM,
    leafCount: String(tree.leafCount),
    root: tree.root,
    proofs: input.events.map((e, i) => ({ eventId: e.eventId, eventSequence: e.eventSequence, leafIndex: String(i), leaf: tree.leaves[i] as string, path: inclusionPath(eventBytes, i) })),
  } satisfies Proofs;

  docs.schemas = {
    schema: SCHEMA_IDS.schemas,
    ...env,
    currencies: { version: currencies.version, exponents: currencies.exponents },
    schemas: Object.fromEntries((Object.keys(SCHEMA_FILES) as SchemaName[]).map((n) => [n, readSchema(n)])),
  };

  for (const [name, doc] of Object.entries(docs) as [SchemaName, object][]) {
    schemaIssues(name, doc).forEach((i) => issues.push(`${name} ${i.path}: ${i.message}`));
  }
  if (issues.length) throw new SealError(issues);

  const files = new Map<string, Uint8Array>();
  const nl = enc.encode("\n");
  files.set(FILES.register, concat(eventBytes.flatMap((b) => [b, nl])));
  files.set(FILES.csv, enc.encode(registerCsv(input.events, demo ? DEMO_LABEL : "")));
  files.set(FILES.summary, canonicalBytes(docs.summary));
  files.set(FILES.scope, canonicalBytes(docs.scope));
  files.set(FILES.proofs, canonicalBytes(docs.proofs));
  files.set(FILES.exceptions, canonicalBytes(docs.exceptions));
  files.set(FILES.corrections, canonicalBytes(docs.corrections));
  files.set(FILES.budgets, canonicalBytes(docs.budgets));
  files.set(FILES.approvals, canonicalBytes(docs.approvals));
  files.set(FILES.schemas, canonicalBytes(docs.schemas));
  files.set(FILES.instructions, enc.encode(verifyInstructions(demo ? DEMO_LABEL : undefined)));

  const roles: Record<string, string> = {
    [FILES.register]: "register",
    [FILES.csv]: "register-csv",
    [FILES.summary]: "period-summary",
    [FILES.scope]: "scope",
    [FILES.proofs]: "inclusion-proofs",
    [FILES.exceptions]: "exceptions",
    [FILES.corrections]: "corrections",
    [FILES.budgets]: "budgets",
    [FILES.approvals]: "approvals",
    [FILES.schemas]: "schemas",
    [FILES.instructions]: "verification-instructions",
  };
  const manifest: Manifest = {
    schema: SCHEMA_IDS.manifest,
    ...env,
    ...ids,
    commitmentSequence: input.commitmentSequence,
    basis: "cash",
    periodStart: input.scope.periodStart,
    periodEnd: input.scope.periodEnd,
    cutoff: input.scope.cutoff,
    publishedAt: input.publishedAt,
    priorRoot: input.priorRoot,
    amendmentOf: input.amendmentOf,
    versions: { event: SCHEMA_IDS.event, currencies: currencies.version, canonicalization: CANONICALIZATION, hash: HASH, merkle: MERKLE_ALGORITHM },
    events: { count: String(tree.leafCount), root: tree.root, register: FILES.register },
    scopeDigest: sha256Hex(files.get(FILES.scope) as Uint8Array),
    files: [...files].map(([path, bytes]) => ({ path, role: roles[path] as string, sha256: sha256Hex(bytes), bytes: String(bytes.length) })),
    authoritySet: input.authoritySet,
    archiveLocations: input.archiveLocations,
    statement: input.manifestStatement,
  };
  schemaIssues("manifest", manifest).forEach((i) => issues.push(`manifest ${i.path}: ${i.message}`));
  if (issues.length) throw new SealError(issues);
  const manifestBytes = canonicalBytes(manifest);
  files.set(FILES.manifest, manifestBytes);
  return { digest: sha256Hex(manifestBytes), files, manifest, root: tree.root };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
