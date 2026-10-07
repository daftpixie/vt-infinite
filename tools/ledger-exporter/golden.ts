#!/usr/bin/env node
/**
 * Golden vectors (PRD MR-37), generated deterministically and frozen in
 * fixtures/marrs-rover/golden. Every value is synthetic and labeled.
 *
 *   node tools/ledger-exporter/golden.ts --out fixtures/marrs-rover/golden
 *
 * Each vector folder holds the exact canonical bytes of each event
 * (events/NNN.json) and vector.json: the leaf hashes, the tree top, the
 * published root and every inclusion path, plus per-currency totals where
 * the vector exercises arithmetic. tests/unit/ledger-golden.test.ts
 * regenerates every byte and fails on any difference, and the standalone
 * verifier reproduces the roots with its own implementation.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { computeTotals, type Openings } from "../../packages/ledger-proof/src/arithmetic.ts";
import { canonicalBytes } from "../../packages/ledger-proof/src/canonical.ts";
import { DEMO_LABEL, SCHEMA_IDS } from "../../packages/ledger-proof/src/constants.ts";
import { buildTree, inclusionPath, MERKLE_ALGORITHM } from "../../packages/ledger-proof/src/merkle.ts";
import type { CashLeg, PublicEvent } from "../../packages/ledger-proof/src/types.ts";

/** A UUIDv4-shaped ID derived from a name, so the vectors regenerate byte for byte. */
export function syntheticUuid(name: string): string {
  const h = createHash("sha256").update(`marrs-rover golden ${name}`).digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x40;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

type Spec = Partial<PublicEvent> & Pick<PublicEvent, "type">;

function event(vector: string, seq: number, s: Spec): PublicEvent {
  return {
    schema: SCHEMA_IDS.event,
    environment: "synthetic-demo",
    demoLabel: DEMO_LABEL,
    eventId: syntheticUuid(`${vector}/${seq}`),
    entityId: "demo",
    periodId: "2000-Q1",
    programId: "program-alpha",
    eventSequence: String(seq),
    effectiveDate: "2000-02-01",
    publishedAt: "2000-04-14T16:00:00Z",
    cashLegs: [],
    classification: { categoryId: "program-supplies", categoryVersion: "1", flow: "operating", restrictionId: null, basis: "cash" },
    purpose: { text: `Synthetic golden vector ${vector}, event ${seq} (demo).` },
    controls: { approvalRefs: [], conflictRefs: [], supportingCommitments: [] },
    evidence: { reportRefs: [] },
    ...s,
  } as PublicEvent;
}

const leg = (bucketId: string, delta: string, boundary: CashLeg["boundary"] = "external", currency = "USD", legId = "leg-1"): CashLeg => ({ legId, bucketId, currency, deltaMinorUnits: delta, boundary });
const receipt = (amount: string, currency = "USD", bucket = "operating-cash"): Spec => ({
  type: "receipt",
  amountMinorUnits: amount,
  currency,
  cashLegs: [leg(bucket, amount, "external", currency)],
  classification: { categoryId: "program-service-fees", categoryVersion: "1", flow: "operating", restrictionId: null, basis: "cash" },
});
const disbursement = (amount: string, currency = "USD", bucket = "operating-cash"): Spec => ({ type: "disbursement", amountMinorUnits: amount, currency, cashLegs: [leg(bucket, `-${amount}`, "external", currency)] });

type Vector = { name: string; description: string; specs: Spec[]; openings?: Openings };

const USD_BUCKETS = (ops = "0", reserve = "0"): Openings => ({
  buckets: [
    { bucketId: "operating-cash", currency: "USD", opening: ops },
    { bucketId: "reserve-cash", currency: "USD", opening: reserve },
  ],
  restrictedFunds: [],
});

export const VECTORS: Vector[] = [
  ...[1, 2, 3, 4, 5, 7, 8].map((n) => ({
    name: `leaves-${n}`,
    description: `${n} leaf${n === 1 ? "" : "s"}: ${n === 1 ? "the root binds a single leaf" : n % 2 ? "an odd count; the last node at each odd level is promoted, never duplicated" : "an even count"}.`,
    specs: Array.from({ length: n }, (_, k) => receipt(String((k + 1) * 1000))),
  })),
  {
    name: "unicode",
    description: "Non-ASCII text is kept exactly as written: accents, CJK, a currency sign, a non-BMP character and quotation marks.",
    specs: [{ ...receipt("1250"), purpose: { text: "Synthetic naïve café receipt — 日本語 — €12 — 𝄞 — \"quoted\" (demo)." } }],
  },
  {
    name: "large-amounts",
    description: "Exact integer minor units at 14 digits, the longest the repository's guards allow without an approved exception; arithmetic is BigInt throughout.",
    specs: [receipt("99999999999999"), disbursement("99999999999998")],
    openings: USD_BUCKETS(),
  },
  {
    name: "transfers",
    description: "An internal transfer (two equal and opposite legs, netting to zero) and a boundary transfer out of scope.",
    specs: [
      receipt("500000"),
      {
        type: "transfer",
        transferKind: "internal",
        amountMinorUnits: "200000",
        currency: "USD",
        cashLegs: [leg("operating-cash", "-200000", "internal", "USD", "leg-1"), leg("reserve-cash", "200000", "internal", "USD", "leg-2")],
        classification: { categoryId: "internal-transfer", categoryVersion: "1", flow: "transfer", restrictionId: null, basis: "cash" },
      },
      {
        type: "transfer",
        transferKind: "boundary",
        amountMinorUnits: "50000",
        currency: "USD",
        cashLegs: [leg("reserve-cash", "-50000", "boundary")],
        classification: { categoryId: "boundary-transfer", categoryVersion: "1", flow: "transfer", restrictionId: null, basis: "cash" },
      },
    ],
    openings: USD_BUCKETS("100000", "0"),
  },
  {
    name: "zero-cash",
    description: "A period with no cash activity is still a non-empty tree: one reconciliation event says so (MR-33).",
    specs: [
      {
        type: "reconciliation",
        programId: "general",
        effectiveDate: "2000-03-31",
        classification: { categoryId: "reconciliation", categoryVersion: "1", flow: "none", restrictionId: null, basis: "cash" },
        purpose: { text: "Synthetic statement: no in-scope cash activity occurred in this period (demo)." },
      },
    ],
    openings: USD_BUCKETS("250000", "0"),
  },
  {
    name: "correction",
    description: "A disbursement, its exact reversal and a replacement, each linked to the original (MR-21).",
    specs: [
      disbursement("64000"),
      {
        ...receipt("64000"),
        type: "reversal",
        classification: { categoryId: "program-supplies", categoryVersion: "1", flow: "operating", restrictionId: null, basis: "cash" },
        correction: { originalEventId: syntheticUuid("correction/1"), kind: "reversal", reason: "Synthetic: entered at the wrong amount (demo)." },
      },
      { ...disbursement("46000"), correction: { originalEventId: syntheticUuid("correction/1"), kind: "replacement", reason: "Synthetic: the corrected amount (demo)." } },
    ],
    openings: USD_BUCKETS("100000", "0"),
  },
  {
    name: "empty-optional",
    description: "Optional fields left out or empty: no correction, no redaction reason, no restriction, no references.",
    specs: [receipt("1")],
  },
  {
    name: "multi-currency",
    description: "USD and EUR events are totalled separately; there is no cross-currency total.",
    specs: [receipt("10000", "USD"), receipt("9000", "EUR", "operating-cash-eur"), disbursement("2500", "EUR", "operating-cash-eur")],
    openings: { buckets: [...USD_BUCKETS().buckets, { bucketId: "operating-cash-eur", currency: "EUR", opening: "0" }], restrictedFunds: [] },
  },
];


/** Every golden file, by path relative to the golden folder. */
export function goldenFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const index: { name: string; description: string; leafCount: string; root: string }[] = [];
  for (const v of VECTORS) {
    const events = v.specs.map((s, k) => event(v.name, k + 1, s));
    const bytes = events.map((e) => canonicalBytes(e));
    bytes.forEach((b, k) => files.set(`${v.name}/events/${String(k + 1).padStart(3, "0")}.json`, b));
    const tree = buildTree(bytes);
    const vector = {
      name: v.name,
      description: v.description,
      demoLabel: DEMO_LABEL,
      algorithm: MERKLE_ALGORITHM,
      leafCount: String(tree.leafCount),
      leaves: tree.leaves,
      top: tree.top,
      root: tree.root,
      paths: bytes.map((_, k) => ({ leafIndex: String(k), path: inclusionPath(bytes, k) })),
      ...(v.openings ? { totals: computeTotals(events, v.openings) } : {}),
    };
    files.set(`${v.name}/vector.json`, canonicalBytes(vector));
    index.push({ name: v.name, description: v.description, leafCount: vector.leafCount, root: vector.root });
  }
  files.set("index.json", canonicalBytes({ demoLabel: DEMO_LABEL, algorithm: MERKLE_ALGORITHM, vectors: index }));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? process.argv[i + 1] : undefined;
  if (!out) {
    console.error("usage: node tools/ledger-exporter/golden.ts --out <dir>");
    process.exit(2);
  }
  for (const [path, bytes] of goldenFiles()) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), bytes);
  }
  console.log(`wrote ${goldenFiles().size} golden files to ${out}`);
}
