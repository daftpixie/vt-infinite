// A small JSON Schema (draft 2020-12) validator for the keywords the
// Marrs Rover v1 schemas use, and no others. A schema with any other keyword
// is refused rather than half-checked: the verifier fails closed.
//
// Supported: type, properties, required, additionalProperties, items,
// minItems, maxItems, enum, const, pattern, minLength, maxLength, allOf,
// if/then/else, $ref to "#/$defs/...", and boolean schemas. Annotations
// ($schema, $id, $defs, title, description, $comment) are ignored.
import { canonicalize } from "./json.mjs";

const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description", "$comment"]);
const SUPPORTED = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "enum",
  "const",
  "pattern",
  "minLength",
  "maxLength",
  "allOf",
  "if",
  "then",
  "else",
  "$ref",
]);

export class SchemaError extends Error {}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}
const typeMatches = (want, v) => {
  const t = typeOf(v);
  return want === t || (want === "number" && t === "integer");
};
const same = (a, b) => canonicalize(a) === canonicalize(b);
const codePoints = (s) => [...s].length;

/** Returns a list of "pointer: message" problems; empty means valid. */
export function validate(schema, value) {
  const root = schema;
  const problems = [];
  const regexCache = new Map();

  const resolve = (ref) => {
    const m = /^#\/\$defs\/([A-Za-z0-9_-]+)$/.exec(ref);
    if (!m || !root.$defs || !(m[1] in root.$defs)) throw new SchemaError(`unsupported $ref ${ref}`);
    return root.$defs[m[1]];
  };

  const check = (s, v, at, out) => {
    if (s === true) return;
    if (s === false) {
      out.push(`${at}: not allowed here`);
      return;
    }
    for (const k of Object.keys(s)) if (!SUPPORTED.has(k) && !ANNOTATIONS.has(k)) throw new SchemaError(`unsupported keyword ${k}`);
    if (s.$ref) check(resolve(s.$ref), v, at, out);
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => typeMatches(t, v))) {
        out.push(`${at}: expected ${types.join(" or ")}`);
        return;
      }
    }
    if (s.const !== undefined && !same(s.const, v)) out.push(`${at}: must be ${canonicalize(s.const)}`);
    if (s.enum !== undefined && !s.enum.some((e) => same(e, v))) out.push(`${at}: must be one of ${s.enum.map((e) => canonicalize(e)).join(", ")}`);
    if (typeof v === "string") {
      if (s.minLength !== undefined && codePoints(v) < s.minLength) out.push(`${at}: shorter than ${s.minLength}`);
      if (s.maxLength !== undefined && codePoints(v) > s.maxLength) out.push(`${at}: longer than ${s.maxLength}`);
      if (s.pattern !== undefined) {
        let re = regexCache.get(s.pattern);
        if (!re) regexCache.set(s.pattern, (re = new RegExp(s.pattern, "u")));
        if (!re.test(v)) out.push(`${at}: does not match ${s.pattern}`);
      }
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) out.push(`${at}: fewer than ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${at}: more than ${s.maxItems} items`);
      if (s.items !== undefined) v.forEach((x, k) => check(s.items, x, `${at}/${k}`, out));
    }
    if (typeOf(v) === "object") {
      for (const r of s.required ?? []) if (!Object.hasOwn(v, r)) out.push(`${at}: missing ${r}`);
      const props = s.properties ?? {};
      for (const [k, x] of Object.entries(v)) {
        const ptr = `${at}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (Object.hasOwn(props, k)) check(props[k], x, ptr, out);
        else if (s.additionalProperties !== undefined) check(s.additionalProperties, x, ptr, out);
      }
    }
    for (const sub of s.allOf ?? []) check(sub, v, at, out);
    if (s.if !== undefined) {
      const trial = [];
      check(s.if, v, at, trial);
      if (trial.length === 0) {
        if (s.then !== undefined) check(s.then, v, at, out);
      } else if (s.else !== undefined) check(s.else, v, at, out);
    }
  };

  check(root, value, "", problems);
  return problems.map((p) => (p.startsWith(":") ? `/${p}` : p));
}
