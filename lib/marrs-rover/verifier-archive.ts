import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "@/packages/ledger-proof/src/merkle.ts";

/**
 * The standalone verifier (tools/ledger-verifier) as one downloadable,
 * reproducible archive (PRD MR-34; decision D1 of 7 Oct 2026).
 *
 * A plain POSIX ustar file, built from the verifier's own source on the
 * server, so what is served is always the current source. It is the same
 * byte for byte on every build: files in a fixed order (byte order of their
 * paths), every timestamp 0, mode 0644, owner and group 0 with no names, no
 * directory entries and no compression. The folder inside is
 * `ledger-verifier/`, and it includes the Apache-2.0 LICENSE.
 */
export const VERIFIER_ARCHIVE_NAME = "marrs-rover-verifier.tar";
export const VERIFIER_ARCHIVE_PATH = `/marrs-rover/verifier/${VERIFIER_ARCHIVE_NAME}`;
const PREFIX = "ledger-verifier";
const BLOCK = 512;

/** The verifier's folder, statically scoped so the server bundle traces only it (next.config.ts ships it). */
export const verifierDir = () => join(process.cwd(), "tools", "ledger-verifier");

/** Every regular file under `dir`, as forward-slash paths in byte order. Anything else is refused. */
function listFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, rel))) {
    const path = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(dir, path));
    if (st.isDirectory()) out.push(...listFiles(dir, path));
    else if (st.isFile()) out.push(path);
    else throw new Error(`not a regular file: ${path}`);
  }
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

function octal(value: number, width: number): string {
  // width - 1 octal digits, then NUL.
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function header(name: string, size: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const put = (offset: number, text: string) => {
    const bytes = Buffer.from(text, "utf8");
    h.set(bytes, offset);
  };
  if (Buffer.byteLength(name) > 100) throw new Error(`path too long for ustar: ${name}`);
  put(0, name);
  put(100, octal(0o644, 8));
  put(108, octal(0, 8)); // uid
  put(116, octal(0, 8)); // gid
  put(124, octal(size, 12));
  put(136, octal(0, 12)); // mtime
  put(148, "        "); // checksum field counts as spaces while summing
  put(156, "0"); // regular file
  put(257, "ustar\0");
  put(263, "00");
  const sum = h.reduce((a, b) => a + b, 0);
  put(148, `${sum.toString(8).padStart(6, "0")}\0 `);
  return h;
}

/** Build the archive from a verifier folder (the repository's by default). */
export function buildVerifierArchive(dir: string = verifierDir()): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const path of listFiles(dir)) {
    const body = new Uint8Array(readFileSync(join(dir, path)));
    parts.push(header(`${PREFIX}/${path}`, body.length), body);
    const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(BLOCK * 2)); // end of archive
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

let cached: { bytes: Uint8Array; sha256: string } | null = null;

/** The served archive and its SHA-256, built once per server process. */
export function verifierArchive(): { bytes: Uint8Array; sha256: string; size: number } {
  if (!cached) {
    const bytes = buildVerifierArchive();
    cached = { bytes, sha256: sha256Hex(bytes) };
  }
  return { ...cached, size: cached.bytes.length };
}
