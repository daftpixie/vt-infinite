import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicEvent } from "@/packages/ledger-proof/src/types.ts";

/** The frozen MR-48 bundle (fixtures/marrs-rover/README.md). */
export const MR48_DIGEST = "7986bc37de829a3875ca8cbc6c1177b4d7c79462502aeb4e17ab80a3e194db8a";
export const MR48_DIR = `fixtures/marrs-rover/bundles/demo/2000-Q1/${MR48_DIGEST}`;
export const TAMPERED_DIR = `fixtures/marrs-rover/tampered/${MR48_DIGEST}`;
export const BOOKS = "tools/ledger-exporter/demo/books.synthetic.json";
export const IDS = "tools/ledger-exporter/demo/public-ids.synthetic.json";

export const readJson = <T = unknown>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
export const mr48 = <T = unknown>(file: string): T => readJson<T>(join(MR48_DIR, file));
export const mr48Events = (): PublicEvent[] =>
  readFileSync(join(MR48_DIR, "register.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PublicEvent);

export const bundleFiles = (dir: string) => new Map(readdirSync(dir).map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));

/** A writable copy of a bundle, under a folder of the same name (or another name). */
export function copyBundle(src = MR48_DIR, name = MR48_DIGEST): string {
  const root = mkdtempSync(join(tmpdir(), "rover-"));
  const dir = join(root, name);
  cpSync(src, dir, { recursive: true });
  return dir;
}

export const clone = <T>(v: T): T => structuredClone(v);
