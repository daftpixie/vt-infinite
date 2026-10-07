import canonicalize from "canonicalize";
import { parseStrictJson, type JsonValue } from "./strict-json.ts";

/**
 * Canonical bytes (PRD MR-32): RFC 8785, the JSON Canonicalization Scheme.
 *
 * The serializer is the pinned `canonicalize` package (Apache-2.0, by one of
 * the RFC's authors), checked against the RFC authors' published test data
 * in tests/unit/ledger-canonical.test.ts. It sorts object keys by UTF-16 code
 * units (RFC 8785 §3.2.3), serializes strings and numbers as ECMAScript does
 * (§3.2.2), and rejects lone surrogates, NaN and Infinity.
 *
 * It would also accept values JSON cannot express (undefined, functions,
 * objects with toJSON) by dropping or converting them, so every value is
 * checked to be plain JSON first. Duplicate keys and malformed input are
 * caught earlier, by the strict parser, because a parsed object no longer
 * shows them.
 */
export function assertPlainJson(value: unknown, path = "$"): asserts value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && !value.isWellFormed()) throw new TypeError(`${path}: lone surrogate`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: number is not finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPlainJson(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError(`${path}: not a plain object`);
    for (const [k, v] of Object.entries(value)) {
      if (!k.isWellFormed()) throw new TypeError(`${path}: lone surrogate in key`);
      if (v === undefined) throw new TypeError(`${path}.${k}: undefined`);
      assertPlainJson(v, `${path}.${k}`);
    }
    return;
  }
  throw new TypeError(`${path}: ${typeof value} is not JSON`);
}

const encoder = new TextEncoder();

/** The RFC 8785 serialization as a string. */
export function canonicalString(value: unknown): string {
  assertPlainJson(value);
  const out = canonicalize(value);
  if (typeof out !== "string") throw new TypeError("value has no JSON form");
  return out;
}

/** The RFC 8785 serialization as UTF-8 bytes: the input to every digest. */
export function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalString(value));
}

/** True when `bytes` are exactly the canonical form of what they encode. */
export function isCanonical(bytes: Uint8Array): boolean {
  const reencoded = canonicalBytes(parseStrictJson(bytes));
  return reencoded.length === bytes.length && reencoded.every((b, i) => b === bytes[i]);
}
