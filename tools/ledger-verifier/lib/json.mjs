// Strict JSON reading and RFC 8785 canonical serialization, written for the
// verifier alone. It shares no code with the website or the exporter, so a
// fault in one implementation is caught by the other.
//
// RFC 8785 (JSON Canonicalization Scheme):
//   §3.2.1  literals null, true, false as is
//   §3.2.2.2 strings: escape only " \ and the control characters U+0000 to
//            U+001F, using \b \t \n \f \r where they exist and \u00xx
//            (lowercase hex) otherwise; everything else as UTF-8
//   §3.2.2.3 numbers: the ECMAScript Number-to-String algorithm
//   §3.2.3  object members sorted by the UTF-16 code units of their names
//   §3.2.4  output encoded as UTF-8

export class JsonError extends Error {
  constructor(message) {
    super(message);
    this.name = "JsonError";
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Bytes to text: strict UTF-8, no byte-order mark. */
export function utf8Text(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new JsonError("byte-order mark");
  try {
    return utf8.decode(bytes);
  } catch {
    throw new JsonError("malformed UTF-8");
  }
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const hasLoneSurrogate = (s) => {
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(k + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        k++;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

/** Parse JSON text, refusing duplicate member names, lone surrogates, non-finite numbers and deep nesting. */
export function parseJson(text, maxDepth = 64) {
  let p = 0;
  const err = (m) => {
    throw new JsonError(`${m} at character ${p}`);
  };
  const skip = () => {
    while (p < text.length && WS.has(text.charCodeAt(p))) p++;
  };
  const readString = () => {
    p++; // opening quote
    const parts = [];
    let start = p;
    while (true) {
      if (p >= text.length) err("unterminated string");
      const c = text.charCodeAt(p);
      if (c === 0x22) break;
      if (c < 0x20) err("raw control character in string");
      if (c === 0x5c) {
        parts.push(text.slice(start, p));
        const e = text[p + 1];
        const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }[e];
        if (simple !== undefined) {
          parts.push(simple);
          p += 2;
        } else if (e === "u") {
          const h = text.slice(p + 2, p + 6);
          if (!/^[0-9A-Fa-f]{4}$/.test(h)) err("bad unicode escape");
          parts.push(String.fromCharCode(Number.parseInt(h, 16)));
          p += 6;
        } else err("bad escape");
        start = p;
        continue;
      }
      p++;
    }
    parts.push(text.slice(start, p));
    p++; // closing quote
    const s = parts.join("");
    if (hasLoneSurrogate(s)) err("lone surrogate");
    return s;
  };
  const readValue = (depth) => {
    if (depth > maxDepth) err("too deeply nested");
    skip();
    const c = text[p];
    if (c === "{") {
      p++;
      const members = new Map();
      skip();
      if (text[p] === "}") {
        p++;
        return {};
      }
      while (true) {
        skip();
        if (text[p] !== '"') err("expected a member name");
        const name = readString();
        if (members.has(name)) err(`duplicate member name ${JSON.stringify(name)}`);
        skip();
        if (text[p] !== ":") err("expected ':'");
        p++;
        members.set(name, readValue(depth + 1));
        skip();
        if (text[p] === ",") {
          p++;
          continue;
        }
        if (text[p] === "}") {
          p++;
          const o = {};
          for (const [k, v] of members) Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
          return o;
        }
        err("expected ',' or '}'");
      }
    }
    if (c === "[") {
      p++;
      const items = [];
      skip();
      if (text[p] === "]") {
        p++;
        return items;
      }
      while (true) {
        items.push(readValue(depth + 1));
        skip();
        if (text[p] === ",") {
          p++;
          continue;
        }
        if (text[p] === "]") {
          p++;
          return items;
        }
        err("expected ',' or ']'");
      }
    }
    if (c === '"') return readString();
    for (const [word, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ]) {
      if (text.startsWith(word, p)) {
        p += word.length;
        return v;
      }
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(text.slice(p, p + 400));
    if (!m) err("unexpected input");
    const n = Number(m[0]);
    if (!Number.isFinite(n)) err("number out of range");
    p += m[0].length;
    return n;
  };
  const v = readValue(0);
  skip();
  if (p !== text.length) err("unexpected trailing input");
  return v;
}

export const parseJsonBytes = (bytes) => parseJson(utf8Text(bytes));

const ESC = { 0x08: "\\b", 0x09: "\\t", 0x0a: "\\n", 0x0c: "\\f", 0x0d: "\\r", 0x22: '\\"', 0x5c: "\\\\" };

function canonicalStringLiteral(s) {
  if (hasLoneSurrogate(s)) throw new JsonError("lone surrogate");
  let out = '"';
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (ESC[c]) out += ESC[c];
    else if (c < 0x20) out += `\\u${c.toString(16).padStart(4, "0")}`;
    else out += s[k];
  }
  return `${out}"`;
}

/** RFC 8785 serialization of a parsed JSON value. */
export function canonicalize(v) {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new JsonError("non-finite number");
    return Object.is(v, -0) ? "0" : String(v);
  }
  if (typeof v === "string") return canonicalStringLiteral(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (typeof v === "object") {
    // Default sort compares UTF-16 code units, as §3.2.3 requires.
    const names = Object.keys(v).sort();
    return `{${names.map((k) => `${canonicalStringLiteral(k)}:${canonicalize(v[k])}`).join(",")}}`;
  }
  throw new JsonError(`${typeof v} is not JSON`);
}

const enc = new TextEncoder();
export const canonicalBytes = (v) => enc.encode(canonicalize(v));

/** True when the bytes are exactly the canonical form of the JSON they hold. */
export function isCanonicalBytes(bytes) {
  const again = canonicalBytes(parseJsonBytes(bytes));
  return again.length === bytes.length && again.every((b, k) => b === bytes[k]);
}
