// The verifier's checks (PRD MR-35). Every check reads only the bundle
// folder and the schemas pinned in this tool; nothing is fetched and the
// website is never consulted.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonicalize, isCanonicalBytes, JsonError, parseJsonBytes, utf8Text } from "./json.mjs";
import { ALGORITHM, checkPath, hex, leafOf, merkleRoot, sha256 } from "./merkle.mjs";
import { SchemaError, validate } from "./schema.mjs";

const SCHEMA_DIR = new URL("../schemas/v1/", import.meta.url);
const SCHEMA_FILES = {
  event: "event.schema.json",
  summary: "period-summary.schema.json",
  scope: "scope.schema.json",
  manifest: "manifest.schema.json",
  proofs: "proofs.schema.json",
  exceptions: "exceptions.schema.json",
  corrections: "corrections.schema.json",
  budgets: "budgets.schema.json",
  approvals: "approvals.schema.json",
  schemas: "schemas.schema.json",
};
const DOC_FILES = {
  "summary.json": "summary",
  "scope.json": "scope",
  "proofs.json": "proofs",
  "exceptions.json": "exceptions",
  "corrections.json": "corrections",
  "budgets.json": "budgets",
  "approvals.json": "approvals",
  "schemas.json": "schemas",
};
const REQUIRED_FILES = ["register.jsonl", "register.csv", "verify.md", ...Object.keys(DOC_FILES)];

let pinned = null;
function pinnedSchemas() {
  if (pinned) return pinned;
  const read = (f) => JSON.parse(readFileSync(new URL(f, SCHEMA_DIR), "utf8"));
  pinned = { schemas: Object.fromEntries(Object.entries(SCHEMA_FILES).map(([k, f]) => [k, read(f)])), currencies: read("currencies.json") };
  return pinned;
}

const FINANCIAL = new Set(["receipt", "disbursement", "transfer", "reversal"]);
const big = (s) => BigInt(s);
const isCalendarDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

function schemaProblems(name, value) {
  try {
    return validate(pinnedSchemas().schemas[name], value);
  } catch (err) {
    if (err instanceof SchemaError) return [`schema ${name} uses ${err.message}`];
    throw err;
  }
}

/** Per-event and register-wide rules (MR-18, MR-21, MR-28). */
export function registerProblems(events, ctx) {
  const out = [];
  const say = (e, m) => out.push(`event ${e?.eventSequence ?? "?"}: ${m}`);
  const seen = new Map();
  const reversedBy = new Map();
  const buckets = new Map(ctx.scope.buckets.map((b) => [b.bucketId, b.currency]));
  const funds = new Set(ctx.scope.restrictedFunds.map((f) => f.restrictionId));
  events.forEach((e, k) => {
    if (seen.has(e.eventId)) say(e, `event ID ${e.eventId} appears twice`);
    if (e.eventSequence !== String(k + 1)) say(e, `line ${k + 1} holds sequence ${e.eventSequence}; expected ${k + 1}`);
    if (e.entityId !== ctx.entityId || e.periodId !== ctx.periodId) say(e, "entity or period differs from the manifest");
    if (!isCalendarDate(e.effectiveDate) || e.effectiveDate < ctx.periodStart || e.effectiveDate > ctx.periodEnd) say(e, `effective date ${e.effectiveDate} is not a date inside the period`);
    if (e.publishedAt > ctx.publishedAt) say(e, "published after the publication");
    if (e.currency !== undefined && !Object.hasOwn(ctx.exponents, e.currency)) say(e, `unknown currency ${e.currency}`);
    if (e.classification.restrictionId !== null && !funds.has(e.classification.restrictionId)) say(e, `restriction ${e.classification.restrictionId} is not in the scope statement`);
    const legIds = new Set();
    for (const l of e.cashLegs) {
      if (legIds.has(l.legId)) say(e, `leg ID ${l.legId} repeats`);
      legIds.add(l.legId);
      if (l.currency !== e.currency) say(e, `leg ${l.legId} currency differs from the event's`);
      if (buckets.get(l.bucketId) !== l.currency) say(e, `leg ${l.legId}: bucket ${l.bucketId} is not an in-scope ${l.currency} bucket`);
    }
    if (FINANCIAL.has(e.type)) {
      const amt = big(e.amountMinorUnits);
      const d = e.cashLegs.map((l) => big(l.deltaMinorUnits));
      const sum = d.reduce((a, b) => a + b, 0n);
      const every = (b) => e.cashLegs.every((l) => l.boundary === b);
      if (e.type === "receipt" && !(every("external") && d.every((x) => x > 0n) && sum === amt)) say(e, "receipt legs must be external, positive and sum to the amount");
      if (e.type === "disbursement" && !(every("external") && d.every((x) => x < 0n) && sum === -amt)) say(e, "disbursement legs must be external, negative and sum to minus the amount");
      if (e.type === "transfer") {
        if (e.classification.restrictionId !== null) say(e, "a transfer carries no restriction");
        const ok =
          e.transferKind === "internal"
            ? e.cashLegs.length === 2 && every("internal") && e.cashLegs[0].bucketId !== e.cashLegs[1].bucketId && sum === 0n && (d[0] === amt || d[0] === -amt)
            : e.cashLegs.length === 1 && every("boundary") && (sum === amt || sum === -amt);
        if (!ok) say(e, `${e.transferKind} transfer legs do not match the amount`);
      }
    }
    if (e.correction) {
      const o = seen.get(e.correction.originalEventId);
      if (!o) say(e, `refers to ${e.correction.originalEventId}, which is not an earlier event`);
      else if (!FINANCIAL.has(o.type) || o.type === "reversal") say(e, "corrects an event that is not an original financial event");
      else if (e.type === "reversal") {
        if (reversedBy.has(o.eventId)) say(e, `event ${o.eventSequence} is reversed twice`);
        const key = (l, sign) => `${l.bucketId}|${l.currency}|${l.boundary}|${(big(l.deltaMinorUnits) * sign).toString()}`;
        const a = e.cashLegs.map((l) => key(l, 1n)).sort().join(",");
        const b = o.cashLegs.map((l) => key(l, -1n)).sort().join(",");
        if (a !== b || e.amountMinorUnits !== o.amountMinorUnits || e.currency !== o.currency || e.classification.restrictionId !== o.classification.restrictionId || e.classification.flow !== o.classification.flow) {
          say(e, `does not exactly reverse event ${o.eventSequence}`);
        }
        reversedBy.set(o.eventId, e);
      } else if (e.type === "reclassification") {
        if (e.classification.restrictionId !== o.classification.restrictionId) say(e, "a v1 reclassification changes the category only, never the restriction");
        if (e.classification.categoryId === o.classification.categoryId && e.classification.categoryVersion === o.classification.categoryVersion) say(e, "reclassification leaves the category unchanged");
      } else if (e.correction.kind === "replacement") {
        if (o.type !== e.type) say(e, "a replacement has its original's type");
        if (!reversedBy.has(o.eventId)) say(e, `replaces event ${o.eventSequence} before it is reversed, so it would count twice`);
      }
    }
    seen.set(e.eventId, e);
  });
  return out;
}

/** Recompute the summary from the register (MR-18, MR-19). Returns the problems found. */
export function balanceProblems(events, summary) {
  const out = [];
  const cur = new Map();
  const line = (c) => {
    if (!cur.has(c)) cur.set(c, { opening: 0n, recOp: 0n, recFin: 0n, disOp: 0n, disFin: 0n, rev: 0n, internal: 0n, boundary: 0n });
    return cur.get(c);
  };
  const buckets = new Map();
  for (const b of summary.buckets) {
    buckets.set(b.bucketId, { currency: b.currency, opening: big(b.opening), closing: big(b.opening) });
    line(b.currency).opening += big(b.opening);
  }
  const funds = new Map();
  for (const f of summary.restrictedFunds) funds.set(`${f.restrictionId}|${f.currency}`, { opening: big(f.opening), rec: 0n, dis: 0n, rev: 0n });
  const counts = { events: 0, financialEvents: 0, receipt: 0, disbursement: 0, transfer: 0, reversal: 0, reclassification: 0, reconciliation: 0, attestation: 0 };

  for (const e of events) {
    counts.events++;
    counts[e.type]++;
    for (const l of e.cashLegs) {
      const b = buckets.get(l.bucketId);
      if (!b || b.currency !== l.currency) {
        out.push(`event ${e.eventSequence}: bucket ${l.bucketId} has no stated ${l.currency} opening balance`);
        continue;
      }
      b.closing += big(l.deltaMinorUnits);
      if (l.boundary === "internal") line(l.currency).internal += big(l.deltaMinorUnits);
      if (l.boundary === "boundary") line(l.currency).boundary += big(l.deltaMinorUnits);
    }
    if (!FINANCIAL.has(e.type)) continue;
    counts.financialEvents++;
    const a = line(e.currency);
    const amt = big(e.amountMinorUnits);
    const net = e.cashLegs.reduce((s, l) => s + big(l.deltaMinorUnits), 0n);
    const fin = e.classification.flow === "financing";
    if (e.type === "receipt") {
      if (fin) a.recFin += amt;
      else a.recOp += amt;
    }
    if (e.type === "disbursement") {
      if (fin) a.disFin += amt;
      else a.disOp += amt;
    }
    if (e.type === "reversal") a.rev += net;
    const r = e.classification.restrictionId;
    if (r) {
      const key = `${r}|${e.currency}`;
      if (!funds.has(key)) {
        out.push(`event ${e.eventSequence}: restricted fund ${r} (${e.currency}) is missing from the summary`);
        funds.set(key, { opening: 0n, rec: 0n, dis: 0n, rev: 0n });
      }
      const f = funds.get(key);
      if (e.type === "receipt") f.rec += amt;
      if (e.type === "disbursement") f.dis += amt;
      if (e.type === "reversal") f.rev += net;
    }
  }

  const stated = new Map(summary.currencies.map((c) => [c.currency, c]));
  for (const [c, a] of cur) {
    const s = stated.get(c);
    const closing = a.opening + a.recOp + a.recFin - a.disOp - a.disFin + a.rev + a.internal + a.boundary;
    if (!s) {
      out.push(`${c}: activity in the register but no ${c} line in the summary`);
      continue;
    }
    const pairs = [
      ["opening", a.opening, s.opening],
      ["operating receipts", a.recOp, s.receipts.operating],
      ["financing receipts", a.recFin, s.receipts.financing],
      ["operating disbursements", a.disOp, s.disbursements.operating],
      ["financing disbursements", a.disFin, s.disbursements.financing],
      ["reversals", a.rev, s.reversalsNet],
      ["internal transfers", a.internal, s.transfers.internalNet],
      ["boundary transfers", a.boundary, s.transfers.boundaryNet],
      ["closing", closing, s.closing],
    ];
    for (const [label, mine, theirs] of pairs) if (mine !== big(theirs)) out.push(`${c} ${label}: the summary says ${theirs}, the register gives ${mine}`);
    if (a.internal !== 0n) out.push(`${c}: internal transfers net to ${a.internal}, not 0`);
    const bucketTotal = [...buckets.values()].filter((b) => b.currency === c).reduce((x, b) => x + b.closing, 0n);
    if (bucketTotal !== closing) out.push(`${c}: buckets close at ${bucketTotal}, the currency at ${closing}`);
    const restricted = summary.restrictedFunds.filter((f) => f.currency === c).reduce((x, f) => x + big(f.closing), 0n);
    if (restricted > closing) out.push(`${c}: restricted funds (${restricted}) exceed the cash that holds them (${closing})`);
  }
  for (const c of stated.keys()) if (!cur.has(c)) out.push(`${c}: a summary line with no opening or activity`);
  for (const b of summary.buckets) {
    const mine = buckets.get(b.bucketId);
    if (mine && mine.closing !== big(b.closing)) out.push(`bucket ${b.bucketId}: the summary closes at ${b.closing}, the register gives ${mine.closing}`);
  }
  for (const f of summary.restrictedFunds) {
    const mine = funds.get(`${f.restrictionId}|${f.currency}`);
    const closing = mine.opening + mine.rec - mine.dis + mine.rev;
    for (const [label, m, t] of [
      ["receipts", mine.rec, f.receipts],
      ["disbursements", mine.dis, f.disbursements],
      ["reversals", mine.rev, f.reversalsNet],
      ["closing", closing, f.closing],
    ]) {
      if (m !== big(t)) out.push(`restricted fund ${f.restrictionId} ${label}: the summary says ${t}, the register gives ${m}`);
    }
    if (closing < 0n) out.push(`restricted fund ${f.restrictionId} is overdrawn (${closing})`);
  }
  for (const [k, v] of Object.entries(counts)) if (String(v) !== summary.counts[k]) out.push(`count of ${k}: the summary says ${summary.counts[k]}, the register has ${v}`);
  return out;
}

function readBundle(dir) {
  const files = new Map();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Symbolic links are refused: they could point outside the bundle.
    if (!lstatSync(p).isFile()) throw new Error(`${name} is not a regular file; a bundle is a flat folder of files`);
    files.set(name, readFileSync(p));
  }
  return files;
}

/**
 * Verify one bundle folder. `expectDigest` is an optional manifest SHA-256
 * from an outside source (a publication receipt, a chain record). The result
 * keeps each layer separate (MR-36).
 */
export function verifyBundle(dir, { expectDigest = null } = {}) {
  const r = {
    folder: dir,
    environment: null,
    demoLabel: null,
    entityId: null,
    periodId: null,
    manifestDigest: null,
    expectedDigest: expectDigest,
    root: null,
    eventCount: null,
    bundle: { valid: false, problems: [] },
    inclusion: { valid: null, checked: 0, problems: [], note: null },
    chain: { state: "not attempted", note: "no chain check is made; this verifier version reads only the downloaded files" },
    balance: { passed: null, problems: [], note: null },
    reconciliation: { evidence: "absent", status: null, date: null, coverage: null, events: 0, openExceptions: [] },
    review: { report: "absent", scope: null },
    _events: null,
    _manifest: null,
  };
  const bundleProblem = (m) => r.bundle.problems.push(m);

  let files;
  try {
    files = readBundle(dir);
  } catch (err) {
    bundleProblem(`cannot read the folder: ${err.message}`);
    return r;
  }

  // Manifest: canonical, schema-valid, and the content address.
  const mBytes = files.get("manifest.json");
  if (!mBytes) {
    bundleProblem("manifest.json is missing");
    return r;
  }
  let manifest;
  try {
    manifest = parseJsonBytes(mBytes);
  } catch (err) {
    bundleProblem(`manifest.json is not valid JSON: ${err.message}`);
    return r;
  }
  r.manifestDigest = hex(sha256(mBytes));
  if (!isCanonicalBytes(mBytes)) bundleProblem("manifest.json is not in canonical form (RFC 8785)");
  schemaProblems("manifest", manifest).forEach((p) => bundleProblem(`manifest.json${p}`));
  if (r.bundle.problems.length) return r;
  r._manifest = manifest;
  Object.assign(r, { environment: manifest.environment, demoLabel: manifest.demoLabel ?? null, entityId: manifest.entityId, periodId: manifest.periodId, root: manifest.events.root, eventCount: manifest.events.count });
  const folderName = basename(dir.replace(/[\\/]+$/, ""));
  if (/^[0-9a-f]{64}$/.test(folderName) && folderName !== r.manifestDigest) bundleProblem(`the folder is named ${folderName} but the manifest's SHA-256 is ${r.manifestDigest}: the manifest was replaced or edited`);
  if (expectDigest && expectDigest !== r.manifestDigest) bundleProblem(`expected manifest SHA-256 ${expectDigest}, found ${r.manifestDigest}`);
  if (manifest.versions.merkle !== ALGORITHM) bundleProblem(`unsupported Merkle algorithm ${manifest.versions.merkle}`);

  // Files: exactly those listed, each with the listed digest and size.
  const listed = new Map(manifest.files.map((f) => [f.path, f]));
  if (listed.size !== manifest.files.length) bundleProblem("the manifest lists a file twice");
  for (const name of files.keys()) if (name !== "manifest.json" && !listed.has(name)) bundleProblem(`${name} is in the folder but not in the manifest`);
  for (const name of REQUIRED_FILES) if (!listed.has(name)) bundleProblem(`the manifest does not list ${name}`);
  for (const [name, f] of listed) {
    const bytes = files.get(name);
    if (!bytes) {
      bundleProblem(`${name} is listed but missing`);
      continue;
    }
    if (hex(sha256(bytes)) !== f.sha256) bundleProblem(`${name}: SHA-256 differs from the manifest`);
    if (String(bytes.length) !== f.bytes) bundleProblem(`${name}: ${bytes.length} bytes, the manifest says ${f.bytes}`);
  }
  if (files.has("scope.json") && hex(sha256(files.get("scope.json"))) !== manifest.scopeDigest) bundleProblem("scope.json does not match the manifest's scope digest");

  // Documents: canonical, schema-valid, one entity and period. A document
  // that fails its schema is reported and then never used by a later step,
  // so a malformed file cannot crash the verifier or be half-trusted.
  const docs = {};
  const unusable = new Map();
  for (const [name, schemaName] of Object.entries(DOC_FILES)) {
    const bytes = files.get(name);
    if (!bytes) {
      unusable.set(schemaName, `${name} is missing`);
      continue;
    }
    let d;
    try {
      d = parseJsonBytes(bytes);
    } catch (err) {
      bundleProblem(`${name} is not valid JSON: ${err.message}`);
      unusable.set(schemaName, `${name} is not valid JSON`);
      continue;
    }
    if (!isCanonicalBytes(bytes)) bundleProblem(`${name} is not in canonical form (RFC 8785)`);
    const sp = schemaProblems(schemaName, d);
    sp.forEach((p) => bundleProblem(`${name}${p}`));
    if (sp.length) {
      unusable.set(schemaName, `${name} does not match its v1 schema`);
      continue;
    }
    docs[schemaName] = d;
    if (d.environment !== manifest.environment || (d.demoLabel ?? null) !== (manifest.demoLabel ?? null)) bundleProblem(`${name}: environment or demo label differs from the manifest`);
    if (schemaName !== "schemas" && (d.entityId !== manifest.entityId || d.periodId !== manifest.periodId)) bundleProblem(`${name}: entity or period differs from the manifest`);
  }

  // The schema set the bundle was sealed against must be the published v1 set.
  if (docs.schemas) {
    const mine = pinnedSchemas();
    for (const [k, s] of Object.entries(mine.schemas)) {
      if (!docs.schemas.schemas || canonicalize(docs.schemas.schemas[k] ?? null) !== canonicalize(s)) bundleProblem(`schemas.json: the ${k} schema differs from the published v1 schema`);
    }
    if (docs.schemas.schemas && Object.keys(docs.schemas.schemas).length !== Object.keys(mine.schemas).length) bundleProblem("schemas.json: unexpected schemas");
    if (canonicalize(docs.schemas.currencies?.exponents ?? null) !== canonicalize(mine.currencies.exponents)) bundleProblem("schemas.json: the currency mapping differs from the published v1 mapping");
  }

  // Register: one canonical, schema-valid event per line.
  const regBytes = files.get("register.jsonl");
  const events = [];
  const lines = [];
  if (regBytes) {
    let text = "";
    try {
      text = utf8Text(regBytes);
    } catch (err) {
      bundleProblem(`register.jsonl: ${err.message}`);
    }
    if (text && !text.endsWith("\n")) bundleProblem("register.jsonl: the last line has no newline");
    const raw = text.split("\n");
    raw.pop();
    const enc = new TextEncoder();
    raw.forEach((line, k) => {
      const bytes = enc.encode(line);
      lines.push(bytes);
      let e;
      try {
        e = parseJsonBytes(bytes);
      } catch (err) {
        bundleProblem(`register line ${k + 1}: ${err instanceof JsonError ? err.message : "unreadable"}`);
        events.push(null);
        return;
      }
      if (!isCanonicalBytes(bytes)) bundleProblem(`register line ${k + 1} is not in canonical form (RFC 8785)`);
      const sp = schemaProblems("event", e);
      sp.forEach((p) => bundleProblem(`register line ${k + 1}${p}`));
      if (e.environment !== manifest.environment || (e.demoLabel ?? null) !== (manifest.demoLabel ?? null)) bundleProblem(`register line ${k + 1}: environment or demo label differs from the manifest`);
      events.push(sp.length ? null : e);
    });
  }
  const usable = events.length > 0 && events.every(Boolean) && docs.scope && docs.schemas;
  if (events.length === 0) bundleProblem("the register is empty; a publication has at least one event");
  if (usable) {
    registerProblems(events, {
      entityId: manifest.entityId,
      periodId: manifest.periodId,
      periodStart: manifest.periodStart,
      periodEnd: manifest.periodEnd,
      publishedAt: manifest.publishedAt,
      scope: docs.scope,
      exponents: pinnedSchemas().currencies.exponents,
    }).forEach(bundleProblem);
  }

  // Count and root.
  if (String(lines.length) !== manifest.events.count) bundleProblem(`the register has ${lines.length} events, the manifest says ${manifest.events.count}`);
  if (lines.length) {
    const root = hex(merkleRoot(lines.map(leafOf)));
    if (root !== manifest.events.root) bundleProblem(`the root of the register is ${root}, the manifest says ${manifest.events.root}`);
  }
  if (docs.proofs && (docs.proofs.root !== manifest.events.root || docs.proofs.leafCount !== manifest.events.count)) bundleProblem("proofs.json names a different root or count from the manifest");

  // Corrections file: derived from the register, so it must match it.
  if (usable && docs.corrections) {
    const derived = new Map();
    for (const e of events) {
      if (!e.correction) continue;
      if (!derived.has(e.correction.originalEventId)) derived.set(e.correction.originalEventId, []);
      derived.get(e.correction.originalEventId).push({ eventId: e.eventId, kind: e.correction.kind, reason: e.correction.reason });
    }
    const expected = [...derived].map(([originalEventId, correctingEvents]) => ({ originalEventId, correctingEvents }));
    if (canonicalize(expected) !== canonicalize(docs.corrections.corrections)) bundleProblem("corrections.json does not match the corrections in the register");
  }
  r.bundle.valid = r.bundle.problems.length === 0;

  // Inclusion proofs: one per event, each from its own leaf to the manifest's root.
  if (!docs.proofs) r.inclusion.note = `${unusable.get("proofs") ?? "proofs.json could not be used"}, so no inclusion proof was checked`;
  else if (!lines.length) r.inclusion.note = "the register has no events, so no inclusion proof was checked";
  if (docs.proofs && lines.length) {
    const proofs = docs.proofs.proofs;
    if (proofs.length !== lines.length) r.inclusion.problems.push(`${proofs.length} proofs for ${lines.length} events`);
    proofs.forEach((p, k) => {
      const idx = Number(p.leafIndex);
      const bytes = lines[idx];
      const e = events[idx];
      if (!bytes || idx !== k) {
        r.inclusion.problems.push(`proof ${k + 1}: leaf index ${p.leafIndex} is out of order or out of range`);
        return;
      }
      if (e && (e.eventId !== p.eventId || e.eventSequence !== p.eventSequence)) r.inclusion.problems.push(`proof ${k + 1}: names a different event from register line ${idx + 1}`);
      if (hex(leafOf(bytes)) !== p.leaf) r.inclusion.problems.push(`proof ${k + 1}: leaf hash differs from register line ${idx + 1}`);
      if (!checkPath(hex(leafOf(bytes)), idx, lines.length, p.path, manifest.events.root)) r.inclusion.problems.push(`proof ${k + 1}: the path does not lead to the manifest's root`);
      r.inclusion.checked++;
    });
    r.inclusion.valid = r.inclusion.problems.length === 0;
  }

  // Balances: recomputed from the full register (MR-35), reported apart from the cryptographic checks.
  if (!docs.summary) r.balance.note = `${unusable.get("summary") ?? "summary.json could not be used"}, so no totals were recomputed`;
  else if (!usable) r.balance.note = "the register or scope statement could not be read, so no totals were recomputed";
  if (usable && docs.summary) {
    try {
      r.balance.problems = balanceProblems(events, docs.summary);
    } catch (err) {
      r.balance.problems = [`could not recompute: ${err.message}`];
    }
    r.balance.passed = r.balance.problems.length === 0;
  }

  // Reconciliation and review evidence: reported as found, never upgraded.
  if (docs.scope) {
    const rec = docs.scope.reconciliation;
    const recEvents = usable ? events.filter((e) => e.type === "reconciliation").length : 0;
    Object.assign(r.reconciliation, { status: rec.status, date: rec.date, coverage: rec.coverage, events: recEvents, evidence: rec.status !== "not-reconciled" || recEvents > 0 ? "present" : "absent" });
  }
  if (docs.exceptions) r.reconciliation.openExceptions = docs.exceptions.exceptions.filter((x) => x.status === "open").map((x) => ({ id: x.exceptionId, kind: x.kind, description: x.description }));
  if (usable) {
    const att = events.filter((e) => e.type === "attestation" && e.evidence.reportRefs.length > 0);
    if (att.length) r.review = { report: "present", scope: att.map((e) => e.purpose.text).join(" / ") };
  }
  r._events = usable ? events : null;
  return r;
}

/** Amendment continuity (MR-21, MR-35): the later bundle extends the earlier one and names its root. */
export function priorProblems(later, earlier) {
  const out = [];
  if (!later._manifest || !earlier._manifest) return ["one of the bundles could not be read"];
  const a = later._manifest;
  const b = earlier._manifest;
  if (a.entityId !== b.entityId) out.push("different entities");
  if (a.priorRoot !== b.events.root) out.push(`the later manifest's prior root is ${a.priorRoot}, the earlier root is ${b.events.root}`);
  if (big(a.commitmentSequence) !== big(b.commitmentSequence) + 1n) out.push(`commitment sequence ${a.commitmentSequence} does not follow ${b.commitmentSequence}`);
  if (a.periodId === b.periodId) {
    if (a.amendmentOf !== earlier.manifestDigest) out.push("an amendment of the same period names the earlier manifest's SHA-256");
    const x = later._events ?? [];
    const y = earlier._events ?? [];
    if (x.length < y.length || y.some((e, k) => canonicalize(e) !== canonicalize(x[k]))) out.push("the earlier events are not an unchanged prefix of the later register: a sealed publication was rewritten");
  }
  return out;
}
