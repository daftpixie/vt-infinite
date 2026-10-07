import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import approvals from "../schemas/v1/approvals.schema.json" with { type: "json" };
import budgets from "../schemas/v1/budgets.schema.json" with { type: "json" };
import corrections from "../schemas/v1/corrections.schema.json" with { type: "json" };
import currencies from "../schemas/v1/currencies.json" with { type: "json" };
import event from "../schemas/v1/event.schema.json" with { type: "json" };
import exceptions from "../schemas/v1/exceptions.schema.json" with { type: "json" };
import manifest from "../schemas/v1/manifest.schema.json" with { type: "json" };
import summary from "../schemas/v1/period-summary.schema.json" with { type: "json" };
import proofs from "../schemas/v1/proofs.schema.json" with { type: "json" };
import schemas from "../schemas/v1/schemas.schema.json" with { type: "json" };
import scope from "../schemas/v1/scope.schema.json" with { type: "json" };
import type { SchemaName } from "./constants.ts";
import type { JsonValue } from "./strict-json.ts";

/**
 * The versioned JSON Schemas (PRD MR-28 to MR-30), read from
 * packages/ledger-proof/schemas/v1. They are the public contract: the
 * verifier ships byte-identical copies and checks a bundle against them with
 * its own validator. Here they are compiled with Ajv, so two independent
 * validators read the same files.
 *
 * They are loaded with static JSON imports rather than read from a path
 * relative to this module, so the website's bundler (stage 4b) ships them
 * with the server code. Each read returns a fresh copy.
 */
const PARSED: Record<SchemaName, unknown> = { event, summary, scope, manifest, proofs, exceptions, corrections, budgets, approvals, schemas };

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
  return structuredClone(PARSED[name]) as JsonValue;
}

export type CurrencyMap = { version: "1"; description: string; exponents: Record<string, string> };
export function readCurrencies(): CurrencyMap {
  return structuredClone(currencies) as CurrencyMap;
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
