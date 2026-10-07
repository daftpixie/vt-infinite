#!/usr/bin/env node
/**
 * Marrs Rover exporter (PRD MR-15 to MR-21, MR-29 to MR-31, MR-48).
 *
 *   node tools/ledger-exporter/export.ts --books <books.json> --ids <allocations.json> --out <dir> [--allocate]
 *
 * Reads private books and the private public-ID allocations, projects them,
 * checks every schema, register rule, balance and the privacy scan, and
 * writes one sealed bundle to <out>/<entityId>/<periodId>/<manifest sha256>/.
 * A sealed folder is never rewritten: if it exists with the same bytes the
 * export is a no-op, and with different bytes it is refused. --allocate
 * gives new entries a public ID and writes the allocations file back.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sealBundle, type SealedBundle } from "../../packages/ledger-proof/src/bundle.ts";
import { scanBundle } from "../../packages/ledger-proof/src/privacy.ts";
import { parseStrictJson } from "../../packages/ledger-proof/src/strict-json.ts";
import { allocate, Allocations, Books, projectBooks } from "./books.ts";

export class SealedConflictError extends Error {
  constructor(dir: string) {
    super(`${dir} is already sealed with different contents; a sealed bundle is never rewritten (MR-21). Publish an amendment instead.`);
    this.name = "SealedConflictError";
  }
}

export type ExportResult = { bundle: SealedBundle; dir: string; written: boolean; allocated: string[] };

export function exportBooks(booksJson: unknown, idsJson: unknown, out: string, { allocateNew = false, privateIdentifiers = [] as string[] } = {}): ExportResult & { allocations: Allocations } {
  const books = Books.parse(booksJson);
  let allocations = Allocations.parse(idsJson);
  let added: string[] = [];
  if (allocateNew) ({ allocations, added } = allocate(books, allocations));
  const bundle = sealBundle(projectBooks(books, allocations));

  const findings = scanBundle(bundle.files, { allowedPhrases: [books.entity.label], privateIdentifiers });
  if (findings.length) {
    throw new Error(`privacy scan failed; nothing written:\n${findings.map((f) => `- ${f.rule} in ${f.file} at ${f.at}: ${f.message} (${f.excerpt})`).join("\n")}`);
  }

  const dir = join(out, books.entity.entityId, books.period.periodId, bundle.digest);
  if (existsSync(dir)) {
    const same =
      readdirSync(dir).length === bundle.files.size &&
      [...bundle.files].every(([name, bytes]) => existsSync(join(dir, name)) && Buffer.compare(readFileSync(join(dir, name)), Buffer.from(bytes)) === 0);
    if (!same) throw new SealedConflictError(dir);
    return { bundle, dir, written: false, allocated: added, allocations };
  }
  // Write to a temporary folder, then rename, so a half-written bundle never sits at the sealed address.
  const tmp = `${dir}.partial-${process.pid}`;
  mkdirSync(tmp, { recursive: true });
  for (const [name, bytes] of bundle.files) writeFileSync(join(tmp, name), bytes, { flag: "wx" });
  renameSync(tmp, dir);
  return { bundle, dir, written: true, allocated: added, allocations };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const booksPath = arg("--books");
  const idsPath = arg("--ids");
  const out = arg("--out");
  if (!booksPath || !idsPath || !out) {
    console.error("usage: node tools/ledger-exporter/export.ts --books <books.json> --ids <allocations.json> --out <dir> [--allocate]");
    process.exit(2);
  }
  const allocateNew = process.argv.includes("--allocate");
  try {
    const privateIdentifiers = (process.env.PRIVATE_IDENTIFIERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const r = exportBooks(parseStrictJson(readFileSync(booksPath)), parseStrictJson(readFileSync(idsPath)), out, { allocateNew, privateIdentifiers });
    if (r.allocated.length) {
      writeFileSync(idsPath, `${JSON.stringify(r.allocations, null, 2)}\n`);
      console.log(`allocated public IDs for ${r.allocated.length} new entries`);
    }
    console.log(`${r.written ? "sealed" : "already sealed, unchanged"}: ${r.dir}`);
    console.log(`events: ${r.bundle.manifest.events.count}  root: ${r.bundle.root}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
