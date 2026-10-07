/**
 * Strict JSON input for schema-approved objects (PRD MR-32).
 *
 * `JSON.parse` silently keeps the last of two duplicate keys, accepts a
 * byte-order mark after decoding, and turns `1e400` into Infinity. Each of
 * those lets two readers disagree about what a file says, so this parser
 * rejects them: input must be well-formed UTF-8 without a BOM, no object may
 * repeat a key, no string may hold a lone surrogate (escaped or not), and
 * every number must be finite. Nesting is limited so hostile input cannot
 * exhaust the stack.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class StrictJsonError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} at offset ${offset}`);
    this.name = "StrictJsonError";
    this.offset = offset;
  }
}

export const MAX_DEPTH = 64;

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Decode bytes as strict UTF-8. A BOM or an invalid sequence is an error. */
export function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new StrictJsonError("byte-order mark", 0);
  try {
    return decoder.decode(bytes);
  } catch {
    throw new StrictJsonError("malformed UTF-8", 0);
  }
}

export function parseStrictJson(input: Uint8Array | string): JsonValue {
  const text = typeof input === "string" ? input : decodeUtf8(input);
  let i = 0;

  const fail = (message: string): never => {
    throw new StrictJsonError(message, i);
  };
  const ws = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  };
  const expect = (ch: string) => {
    if (text[i] !== ch) fail(`expected '${ch}'`);
    i++;
  };

  function str(): string {
    expect('"');
    let out = "";
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const ch = text[i] as string;
      const code = ch.charCodeAt(0);
      if (ch === '"') {
        i++;
        break;
      }
      if (code < 0x20) fail("control character in string");
      if (ch === "\\") {
        const esc = text[i + 1];
        i += 2;
        switch (esc) {
          case '"':
          case "\\":
          case "/":
            out += esc;
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad \\u escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            i -= 1;
            fail("bad escape");
        }
        continue;
      }
      out += ch;
      i++;
    }
    if (!out.isWellFormed()) fail("lone surrogate in string");
    return out;
  }

  function num(): number {
    const start = i;
    const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (!m) fail("bad number");
    i += (m as RegExpExecArray)[0].length;
    const n = Number(text.slice(start, i));
    if (!Number.isFinite(n)) {
      i = start;
      fail("number is not finite");
    }
    return n;
  }

  function value(depth: number): JsonValue {
    if (depth > MAX_DEPTH) fail("nesting too deep");
    ws();
    const ch = text[i];
    if (ch === "{") {
      i++;
      const obj: { [key: string]: JsonValue } = Object.create(null);
      const keys = new Set<string>();
      ws();
      if (text[i] === "}") {
        i++;
        return { ...obj };
      }
      for (;;) {
        ws();
        const at = i;
        const key = str();
        if (keys.has(key)) {
          i = at;
          fail(`duplicate key ${JSON.stringify(key)}`);
        }
        keys.add(key);
        ws();
        expect(":");
        obj[key] = value(depth + 1);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        expect("}");
        // A null-prototype object keeps "__proto__" as an ordinary key; copy into a plain one only after the check.
        return Object.fromEntries(Object.entries(obj)) as { [key: string]: JsonValue };
      }
    }
    if (ch === "[") {
      i++;
      const arr: JsonValue[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        expect("]");
        return arr;
      }
    }
    if (ch === '"') return str();
    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) return num();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    return fail("unexpected character");
  }

  const v = value(0);
  ws();
  if (i !== text.length) fail("trailing characters");
  return v;
}
