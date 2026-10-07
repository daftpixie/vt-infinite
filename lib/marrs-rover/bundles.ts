import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { balanceIssues, computeTotals, summaryDiscrepancies } from "@/packages/ledger-proof/src/arithmetic.ts";
import { canonicalString, isCanonical } from "@/packages/ledger-proof/src/canonical.ts";
import { DEMO_LABEL, FILES, type SchemaName } from "@/packages/ledger-proof/src/constants.ts";
import { registerIssues } from "@/packages/ledger-proof/src/invariants.ts";
import { buildTree, sha256Hex, verifyInclusion } from "@/packages/ledger-proof/src/merkle.ts";
import { readCurrencies, readSchema, SCHEMA_FILES, schemaIssues } from "@/packages/ledger-proof/src/schemas.ts";
import { parseStrictJson, type JsonValue } from "@/packages/ledger-proof/src/strict-json.ts";
import type { Exceptions, Manifest, PeriodSummary, Proofs, PublicEvent, ScopeStatement } from "@/packages/ledger-proof/src/types.ts";
import { DEMO_ENTITY_ID } from "@/lib/flags";
import type { Approval, Budget, BundleFile, BundleResult, Correction, LoadedBundle } from "./types";

/**
 * Sealed Marrs Rover bundles, read from the repository and checked through
 * the stage 4a library before any page shows them (PRD MR-29 to MR-35).
 *
 * The explorer serves only the synthetic demo entity: real data stays off
 * (MARRS_ROVER_REAL_DATA_ENABLED), and no other entity's folder is read.
 * A bundle that fails any check is never shown; the page says so instead.
 */
let rootOverride: string | null = null;

/** Tests point the explorer at a temporary copy (for example, a tampered one). */
export function setBundleRootForTests(dir: string | null): void {
  rootOverride = dir;
  cache.clear();
}

// Statically scoped, so the server bundle traces only this folder (next.config.ts ships it).
const bundleRoot = () => (rootOverride ? resolve(/* turbopackIgnore: true */ rootOverride) : join(process.cwd(), "fixtures", "marrs-rover", "bundles"));

const PERIOD = /^[0-9]{4}-[A-Z0-9]{1,8}$/;
const DIGEST = /^[0-9a-f]{64}$/;

export const isDigest = (s: string) => DIGEST.test(s);

/** A sealed bundle's location; nothing here is trusted until loadBundle passes. */
export type BundleRef = { entityId: string; periodId: string; digest: string };

function dirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every sealed bundle folder of the demo entity, as `<entity>/<period>/<manifest digest>`. */
export function listBundles(): BundleRef[] {
  const entityId = DEMO_ENTITY_ID;
  const out: BundleRef[] = [];
  for (const periodId of dirs(join(bundleRoot(), entityId))) {
    if (!PERIOD.test(periodId)) continue;
    for (const digest of dirs(join(bundleRoot(), entityId, periodId))) {
      if (DIGEST.test(digest)) out.push({ entityId, periodId, digest });
    }
  }
  return out;
}

const cache = new Map<string, BundleResult>();

/** Load and check one sealed bundle. Results are cached: a sealed folder never changes. */
export function loadBundle(ref: BundleRef): BundleResult {
  const { entityId, periodId, digest } = ref;
  const fail = (reason: string): BundleResult => ({ ok: false, entityId, periodId, digest, reason });
  if (entityId !== DEMO_ENTITY_ID || !PERIOD.test(periodId) || !DIGEST.test(digest)) return fail("This is not a publication the explorer serves.");
  const dir = join(bundleRoot(), entityId, periodId, digest);
  const hit = cache.get(dir);
  if (hit) return hit;
  let result: BundleResult;
  try {
    result = check(dir, ref);
  } catch {
    result = fail("Its files could not be read.");
  }
  cache.set(dir, result);
  return result;
}

/** The bytes of one file of a bundle that has passed every check, or null. */
export function bundleFileBytes(ref: BundleRef, path: string): Uint8Array | null {
  const r = loadBundle(ref);
  if (!r.ok || !r.bundle.files.some((f) => f.path === path)) return null;
  const bytes = new Uint8Array(readFileSync(join(bundleRoot(), ref.entityId, ref.periodId, ref.digest, path)));
  // Checked again on every read: what is served is exactly what was sealed.
  const listed = r.bundle.files.find((f) => f.path === path);
  return listed && sha256Hex(bytes) === listed.sha256 ? bytes : null;
}

class CheckFailed extends Error {}
const must = (ok: boolean, reason: string) => {
  if (!ok) throw new CheckFailed(reason);
};

function readJson(dir: string, name: string, schema: SchemaName): JsonValue {
  const bytes = new Uint8Array(readFileSync(join(dir, name)));
  let value: JsonValue;
  try {
    value = parseStrictJson(bytes);
  } catch {
    throw new CheckFailed(`${name} is not valid JSON.`);
  }
  must(isCanonical(bytes), `${name} is not in canonical form.`);
  must(schemaIssues(schema, value).length === 0, `${name} does not match its published schema.`);
  return value;
}

function check(dir: string, ref: BundleRef): BundleResult {
  try {
    return { ok: true, bundle: checkOrThrow(dir, ref) };
  } catch (err) {
    if (err instanceof CheckFailed) return { ok: false, ...ref, reason: err.message };
    throw err;
  }
}

function checkOrThrow(dir: string, ref: BundleRef): LoadedBundle {
  // 1. The folder is named for the manifest's own SHA-256.
  const manifestBytes = new Uint8Array(readFileSync(join(dir, FILES.manifest)));
  must(sha256Hex(manifestBytes) === ref.digest, "Its manifest does not match the SHA-256 it was published under.");
  const manifest = readJson(dir, FILES.manifest, "manifest") as unknown as Manifest;
  must(manifest.entityId === ref.entityId && manifest.periodId === ref.periodId, "Its manifest names a different entity or period.");

  // 2. Demo data is labeled, and only demo data is served.
  must(manifest.environment === "synthetic-demo" && manifest.demoLabel === DEMO_LABEL, "It is not labeled as demo data.");

  // 3. Exactly the listed files, each with its sealed size and SHA-256.
  const present = readdirSync(dir).sort();
  const listed = [FILES.manifest, ...manifest.files.map((f) => f.path)].sort();
  must(canonicalString(present) === canonicalString(listed), "Its folder does not hold exactly the files its manifest lists.");
  must(present.every((name) => lstatSync(join(dir, name)).isFile()), "Its folder holds something other than plain files.");
  for (const f of manifest.files) {
    const bytes = new Uint8Array(readFileSync(join(dir, f.path)));
    must(String(bytes.length) === f.bytes && sha256Hex(bytes) === f.sha256, `The file ${f.path} does not match the SHA-256 sealed in its manifest.`);
  }

  // 4. Every document is canonical, schema-valid and names the same publication.
  const summary = readJson(dir, FILES.summary, "summary") as unknown as PeriodSummary;
  const scope = readJson(dir, FILES.scope, "scope") as unknown as ScopeStatement;
  const proofs = readJson(dir, FILES.proofs, "proofs") as unknown as Proofs;
  const exceptions = readJson(dir, FILES.exceptions, "exceptions") as unknown as Exceptions;
  const corrections = readJson(dir, FILES.corrections, "corrections") as unknown as { corrections: Correction[] } & Record<string, unknown>;
  const budgets = readJson(dir, FILES.budgets, "budgets") as unknown as { budgets: Budget[] } & Record<string, unknown>;
  const approvals = readJson(dir, FILES.approvals, "approvals") as unknown as { approvals: Approval[] } & Record<string, unknown>;
  const schemas = readJson(dir, FILES.schemas, "schemas") as unknown as { schemas: Record<string, JsonValue>; currencies: { version: string; exponents: Record<string, string> } };
  const currencies = readCurrencies();
  must(
    canonicalString(schemas.schemas) === canonicalString(Object.fromEntries((Object.keys(SCHEMA_FILES) as SchemaName[]).map((n) => [n, readSchema(n)]))) &&
      canonicalString(schemas.currencies) === canonicalString({ version: currencies.version, exponents: currencies.exponents }),
    "Its schemas are not the published v1 set.",
  );
  const schemaEnv = schemas as unknown as Record<string, unknown>;
  must(schemaEnv.environment === "synthetic-demo" && schemaEnv.demoLabel === DEMO_LABEL, "One of its files is not labeled as demo data.");
  for (const doc of [summary, scope, proofs, exceptions, corrections, budgets, approvals] as Record<string, unknown>[]) {
    must(doc.entityId === ref.entityId && doc.periodId === ref.periodId, "Its files name different publications.");
    must(doc.environment === "synthetic-demo" && doc.demoLabel === DEMO_LABEL, "One of its files is not labeled as demo data.");
  }
  must(sha256Hex(new Uint8Array(readFileSync(join(dir, FILES.scope)))) === manifest.scopeDigest, "Its scope statement does not match the manifest.");

  // 5. The register: one canonical, schema-valid event per line, obeying the register rules.
  const registerText = readFileSync(join(dir, FILES.register), "utf8");
  must(registerText.endsWith("\n"), "Its register is incomplete.");
  const lines = registerText.slice(0, -1).split("\n");
  const enc = new TextEncoder();
  const eventBytes = lines.map((l) => enc.encode(l));
  const events = eventBytes.map((b, i) => {
    let e: JsonValue;
    try {
      e = parseStrictJson(b);
    } catch {
      throw new CheckFailed(`Register line ${i + 1} is not valid JSON.`);
    }
    must(isCanonical(b) && schemaIssues("event", e).length === 0, `Register line ${i + 1} is not a valid event.`);
    return e as unknown as PublicEvent;
  });
  const issues = registerIssues(events, {
    entityId: ref.entityId,
    periodId: ref.periodId,
    periodStart: manifest.periodStart,
    periodEnd: manifest.periodEnd,
    publishedAt: manifest.publishedAt,
    scope,
    currencies,
  });
  must(issues.length === 0, "Its register breaks the published register rules.");
  must(events.every((e) => e.environment === "synthetic-demo" && e.demoLabel === DEMO_LABEL), "One of its events is not labeled as demo data.");

  // 6. The Merkle root and every inclusion proof.
  const tree = buildTree(eventBytes);
  must(String(tree.leafCount) === manifest.events.count && tree.root === manifest.events.root, "Its events do not give the root in its manifest.");
  must(proofs.root === tree.root && proofs.leafCount === manifest.events.count && proofs.proofs.length === events.length, "Its proofs do not match its manifest.");
  proofs.proofs.forEach((p, i) => {
    const e = events[i] as PublicEvent;
    must(
      p.leafIndex === String(i) && p.eventId === e.eventId && p.eventSequence === e.eventSequence && p.leaf === tree.leaves[i] && verifyInclusion(p.leaf, i, tree.leafCount, p.path, tree.root),
      `The inclusion proof for event ${i + 1} does not lead to the published root.`,
    );
  });

  // 7. The totals recompute exactly from the full register.
  const openings = {
    buckets: summary.buckets.map((b) => ({ bucketId: b.bucketId, currency: b.currency, opening: b.opening })),
    restrictedFunds: summary.restrictedFunds.map((f) => ({ restrictionId: f.restrictionId, currency: f.currency, opening: f.opening })),
  };
  const totals = computeTotals(events, openings);
  must(summaryDiscrepancies(summary, totals).length === 0 && balanceIssues(totals).length === 0, "Its stated totals do not recompute from its register.");

  // 8. The correction history is the one the register implies.
  const derived = new Map<string, Correction["correctingEvents"]>();
  for (const e of events) {
    if (!e.correction) continue;
    derived.set(e.correction.originalEventId, [...(derived.get(e.correction.originalEventId) ?? []), { eventId: e.eventId, kind: e.correction.kind, reason: e.correction.reason }]);
  }
  must(canonicalString(corrections.corrections) === canonicalString([...derived].map(([originalEventId, correctingEvents]) => ({ originalEventId, correctingEvents }))), "Its correction history does not match its register.");

  const files: BundleFile[] = [
    { path: FILES.manifest, role: "manifest", sha256: ref.digest, bytes: manifestBytes.length },
    ...manifest.files.map((f) => ({ path: f.path, role: f.role, sha256: f.sha256, bytes: Number(f.bytes) })),
  ];
  return {
    digest: ref.digest,
    manifest,
    events,
    summary,
    scope,
    proofs,
    exceptions,
    corrections: corrections.corrections,
    budgets: budgets.budgets,
    approvals: approvals.approvals,
    files,
    currencyExponents: Object.fromEntries(Object.entries(currencies.exponents).map(([c, x]) => [c, Number(x)])),
  };
}

/** Whether a path exists as a regular file; used only to tell "missing" from "failed". */
export function bundleExists(ref: BundleRef): boolean {
  try {
    return statSync(join(bundleRoot(), ref.entityId, ref.periodId, ref.digest, FILES.manifest)).isFile();
  } catch {
    return false;
  }
}
