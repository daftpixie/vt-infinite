import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { SchemaName } from "./constants.ts";
import type { JsonValue } from "./strict-json.ts";

/**
 * The versioned JSON Schemas (PRD MR-28 to MR-30), read from
 * packages/ledger-proof/schemas/v1. They are the public contract: the
 * verifier ships byte-identical copies and checks a bundle against them with
 * its own validator. Here they are compiled with Ajv, so two independent
 * validators read the same files.
 */
const DIR = new URL("../schemas/v1/", import.meta.url);

export const SCHEMA_FILES: Record<SchemaName, string> = {
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

export function readSchema(name: SchemaName): JsonValue {
  return JSON.parse(readFileSync(new URL(SCHEMA_FILES[name], DIR), "utf8")) as JsonValue;
}

export type CurrencyMap = { version: "1"; description: string; exponents: Record<string, string> };
export function readCurrencies(): CurrencyMap {
  return JSON.parse(readFileSync(new URL("currencies.json", DIR), "utf8")) as CurrencyMap;
}

let ajv: Ajv2020 | null = null;
const compiled = new Map<SchemaName, ValidateFunction>();

export type SchemaIssue = { path: string; message: string };

/** Validate one document against its v1 schema. Returns the issues, empty when valid. */
export function schemaIssues(name: SchemaName, value: unknown): SchemaIssue[] {
  ajv ??= new Ajv2020({ strictSchema: true, strictNumbers: true, strictTuples: true, strictRequired: false, strictTypes: false, allErrors: true, unicodeRegExp: true });
  let fn = compiled.get(name);
  if (!fn) {
    fn = ajv.compile(readSchema(name) as object);
    compiled.set(name, fn);
  }
  if (fn(value)) return [];
  return (fn.errors ?? []).map((e) => ({ path: e.instancePath || "/", message: `${e.keyword}: ${e.message ?? "invalid"}` }));
}
