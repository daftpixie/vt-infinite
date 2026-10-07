import { parseStrictJson, type JsonValue } from "./strict-json.ts";

/**
 * Release privacy scan for a publication bundle (PRD MR-22 to MR-27, MR-12).
 *
 * Fails a bundle that contains anything the PRD keeps out of public files:
 * bank and card details, personal names, individuals' wallet addresses or
 * payment signatures, private approvals, salts, keys and other secrets.
 * Matching is a release gate and a prompt for a person's review, not proof
 * that a bundle is safe: a name the heuristics miss is still a leak. The
 * scan never prints a matched value in full.
 */
export type PrivacyFinding = { rule: string; file: string; at: string; excerpt: string; message: string };

export type ScanOptions = {
  /** Title Case phrases that are approved public labels, not people (for example the synthetic entity's label). */
  allowedPhrases?: string[];
  /** Private names or identifiers to keep out, from the private configuration (never committed). */
  privateIdentifiers?: string[];
};

/** Keys whose values are canonical integers (amounts, counts, sizes). Other all-digit strings are treated as possible account numbers. */
const NUMERIC_KEYS = new Set([
  "amountMinorUnits",
  "deltaMinorUnits",
  "opening",
  "closing",
  "operating",
  "financing",
  "reversalsNet",
  "internalNet",
  "boundaryNet",
  "receipts",
  "disbursements",
  "events",
  "financialEvents",
  "receipt",
  "disbursement",
  "transfer",
  "reversal",
  "reclassification",
  "reconciliation",
  "attestation",
  "eventSequence",
  "commitmentSequence",
  "categoryVersion",
  "version",
  "count",
  "leafCount",
  "leafIndex",
  "bytes",
  "USD",
  "EUR",
  "JPY",
]);
/** Keys whose values are public SHA-256 digests. A long hex string anywhere else may be a salt or key. */
const DIGEST_KEYS = new Set(["sha256", "root", "leaf", "hash", "scopeDigest", "priorRoot", "amendmentOf", "supportingCommitments"]);
/** Keys that hold free text a person wrote, checked for names. */
const TEXT_KEYS = new Set(["text", "description", "reason", "statement", "coverage", "varianceNote", "scope", "label", "entityLabel", "ownerRole", "responsibleRole", "role"]);
const FORBIDDEN_KEY = /salt|secret|password|passphrase|private[-_]?key|privkey|seed|mnemonic|nonce|token|apikey|api[-_]key|credential|iban|routing|account[-_]?number|sort[-_]?code|swift|bic|approver|approved[-_]?by|signer|signed[-_]?by|payee[-_]?name|beneficiary|ssn|tax[-_]?id/i;

const mask = (s: string) => (s.length <= 4 ? "****" : `${s.slice(0, 2)}…(${s.length} chars)`);

function ibanValid(s: string): boolean {
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const d of r) m = (m * 10 + Number(d)) % 97;
  return m === 1;
}
function abaValid(s: string): boolean {
  const d = [...s].map(Number);
  const sum = 3 * ((d[0] ?? 0) + (d[3] ?? 0) + (d[6] ?? 0)) + 7 * ((d[1] ?? 0) + (d[4] ?? 0) + (d[7] ?? 0)) + ((d[2] ?? 0) + (d[5] ?? 0) + (d[8] ?? 0));
  return sum % 10 === 0 && /[1-9]/.test(s);
}
function luhnValid(s: string): boolean {
  let sum = 0;
  [...s].reverse().forEach((ch, i) => {
    let n = Number(ch);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  });
  return sum % 10 === 0;
}

type Hit = { rule: string; match: string; message: string };

/** Rules for any public string. */
/** Title Case phrases that are part of the fixed public vocabulary, never a person. */
export const DEFAULT_ALLOWED_PHRASES = ["VT Infinite", "Marrs Rover", "Node.js", "SHA-256", "Demo data"];

export function textHits(text: string, opts: ScanOptions = {}, { names = true } = {}): Hit[] {
  const hits: Hit[] = [];
  const push = (rule: string, match: string, message: string) => hits.push({ rule, match, message });
  for (const m of text.matchAll(/\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]){11,30}\b/g)) if (ibanValid(m[0].replace(/ /g, ""))) push("bank-iban", m[0], "IBAN (bank account number)");
  for (const m of text.matchAll(/(?<![0-9])[0-9]{9}(?![0-9])/g)) if (abaValid(m[0])) push("bank-routing", m[0], "looks like a US bank routing number");
  for (const m of text.matchAll(/(?<![0-9])(?:[0-9][ -]?){12,18}[0-9](?![0-9])/g)) if (luhnValid(m[0].replace(/[ -]/g, ""))) push("card-number", m[0], "looks like a payment card number");
  for (const m of text.matchAll(/(?<![0-9])[0-9]{10,17}(?![0-9])/g)) push("account-like-number", m[0], "long digit run in text: possible account number");
  for (const m of text.matchAll(/\b(?:swift|bic)\b\W{0,3}[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi)) push("bank-swift", m[0], "SWIFT/BIC code");
  for (const m of text.matchAll(/(?<![0-9])[0-9]{3}-[0-9]{2}-[0-9]{4}(?![0-9])/g)) push("us-ssn", m[0], "looks like a Social Security number");
  for (const m of text.matchAll(/(?<![0-9])[0-9]{2}-[0-9]{7}(?![0-9])/g)) push("us-ein", m[0], "looks like an employer identification number");
  for (const m of text.matchAll(/[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g)) push("email", m[0], "email address");
  for (const m of text.matchAll(/\+?\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}\b/g)) push("phone", m[0], "phone number");
  for (const m of text.matchAll(/(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g)) if (/[0-9]/.test(m[0]) && /[A-Z]/.test(m[0]) && /[a-z]/.test(m[0])) push("wallet-address", m[0], "looks like a Solana or Bitcoin address");
  for (const m of text.matchAll(/\b0x[0-9a-fA-F]{40}\b/g)) push("wallet-address", m[0], "looks like an Ethereum address");
  for (const m of text.matchAll(/\bbc1[ac-hj-np-z02-9]{11,71}\b/g)) push("wallet-address", m[0], "looks like a Bitcoin address");
  for (const m of text.matchAll(/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{43,}={0,2}(?![A-Za-z0-9+/=])/g)) if (/[0-9]/.test(m[0]) && /[A-Z]/.test(m[0]) && /[a-z]/.test(m[0])) push("secret-like-value", m[0], "long base64 value: possible key or salt");
  for (const m of text.matchAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g)) push("secret-like-value", m[0], "private key block");
  for (const id of opts.privateIdentifiers ?? []) if (id && text.toLowerCase().includes(id.toLowerCase())) push("private-identifier", id, "a private identifier from the private configuration");
  if (names) {
    let t = text;
    for (const p of [...DEFAULT_ALLOWED_PHRASES, ...(opts.allowedPhrases ?? [])]) t = t.split(p).join(" ");
    for (const m of t.matchAll(/\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+[A-Z][a-z]+/g)) push("personal-name", m[0], "an honorific and a name");
    for (const m of t.matchAll(/\b(?:approved by|signed by|paid to|payee|recipient|beneficiary|on behalf of)\s*:?\s+[A-Z][a-z]+/gi)) push("private-approval", m[0], "names who approved, signed, or was paid");
    for (const m of t.matchAll(/\b[A-Z][a-z]{1,30}(?:\s+[A-Z]\.)?\s+[A-Z][a-z]{1,30}(?:-[A-Z][a-z]+)?\b/g)) push("personal-name", m[0], "two capitalized words in a row: possibly a person's name");
  }
  return hits;
}

/** Walk a parsed JSON file and collect findings, with a JSON Pointer for each. */
export function jsonFindings(file: string, value: JsonValue, opts: ScanOptions = {}): PrivacyFinding[] {
  const out: PrivacyFinding[] = [];
  const walk = (v: JsonValue, path: string[], key: string | null, parents: JsonValue[]) => {
    const at = `/${path.join("/")}`;
    const add = (h: Hit) => out.push({ rule: h.rule, file, at, excerpt: mask(h.match), message: h.message });
    if (Array.isArray(v)) {
      if (v.length >= 32 && v.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 255)) add({ rule: "secret-like-value", match: "[byte array]", message: "byte array: possible keypair" });
      v.forEach((x, i) => walk(x, [...path, String(i)], key, [...parents, v]));
      return;
    }
    if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        // The schema names its own allowed shapes; key names inside schemas.json are not data.
        const inSchemaSet = path[0] === "schemas" || path[0] === "currencies";
        if (!inSchemaSet && FORBIDDEN_KEY.test(k) && !(k === "signature" && path.at(-1) === "nativePayment")) {
          add({ rule: "forbidden-field", match: k, message: `field "${k}" may hold private financial, approval or secret data` });
        }
        if (!inSchemaSet && k === "nativePayment" && x !== null && ((parents[0] ?? v) as { environment?: unknown }).environment === "synthetic-demo") {
          add({ rule: "native-payment", match: k, message: "a synthetic bundle carries no chain payment; chain state is not attempted" });
        }
        walk(x, [...path, k], k, [...parents, v]);
      }
      return;
    }
    if (typeof v !== "string") return;
    if (path[0] === "schemas" || path[0] === "currencies") return; // pattern strings and descriptions of the contract
    if (key && NUMERIC_KEYS.has(key) && /^(?:0|-?[1-9][0-9]*)$/.test(v)) return;
    if (key && DIGEST_KEYS.has(key) && /^[0-9a-f]{64}$/.test(v)) return;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return; // public event UUIDs
    if (/(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])/i.test(v)) add({ rule: "secret-like-value", match: v, message: "long hex value outside a digest field: possible salt or key" });
    if (key === "signature" && path.at(-2) === "nativePayment") return; // payee kind is checked by the schema (MR-12)
    textHits(v, opts, { names: key !== null && TEXT_KEYS.has(key) }).forEach(add);
  };
  walk(value, [], null, []);
  return out;
}

const dec = new TextDecoder("utf-8", { fatal: true });

/** Scan every file of a bundle. JSON and JSON Lines are walked; CSV and Markdown are scanned as text. */
export function scanBundle(files: Map<string, Uint8Array>, opts: ScanOptions = {}): PrivacyFinding[] {
  const out: PrivacyFinding[] = [];
  for (const [file, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let text: string;
    try {
      text = dec.decode(bytes);
    } catch {
      out.push({ rule: "unreadable", file, at: "/", excerpt: "", message: "not UTF-8 text; a bundle holds only text files" });
      continue;
    }
    if (file.endsWith(".jsonl")) {
      text.split("\n").forEach((line, i) => {
        if (line === "") return;
        out.push(...jsonFindings(file, parseStrictJson(line), opts).map((f) => ({ ...f, at: `line ${i + 1}${f.at}` })));
      });
    } else if (file.endsWith(".json")) {
      out.push(...jsonFindings(file, parseStrictJson(bytes), opts));
    } else if (file.endsWith(".csv")) {
      const [header, ...rows] = text.split("\r\n").filter(Boolean);
      const cols = (header ?? "").split(",");
      rows.forEach((row, r) => {
        // Cells are split simply here; quoted commas only make the check stricter.
        row.split(",").forEach((cell, c) => {
          const col = cols[c] ?? "";
          if (["eventSequence", "amountMinorUnits", "netCashDeltaMinorUnits"].includes(col) && /^(?:0|-?[1-9][0-9]*)$/.test(cell)) return;
          if (col === "eventId" || col === "correctionOf") return;
          textHits(cell, opts, { names: col === "purpose" || col === "label" }).forEach((h) => out.push({ rule: h.rule, file, at: `row ${r + 2} ${col}`, excerpt: mask(h.match), message: h.message }));
        });
      });
    } else {
      textHits(text, opts, { names: false }).forEach((h) => out.push({ rule: h.rule, file, at: "text", excerpt: mask(h.match), message: h.message }));
    }
  }
  return out;
}
