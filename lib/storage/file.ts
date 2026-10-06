import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertKey, isSnapshot, type Snapshot, type SnapshotStore } from "./types";

/**
 * File-backed store for local development and tests. Each key is one JSON
 * file; writes go to a temporary file and are renamed into place, so a
 * crash mid-write never leaves a half-written snapshot.
 */
export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    assertKey(key);
    return join(this.dir, `${key.replace(/:/g, "__")}.json`);
  }

  async get<T>(key: string): Promise<Snapshot<T> | null> {
    let raw: string;
    try {
      raw = await readFile(this.path(key), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) throw new Error(`Corrupt snapshot for ${key}`);
    return parsed as Snapshot<T>;
  }

  async put<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
    const target = this.path(key);
    try {
      await mkdir(this.dir, { recursive: true });
      const tmp = `${target}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot), "utf8");
      await rename(tmp, target);
    } catch (err) {
      const e = err as { name?: string; code?: string };
      console.error(`snapshots: write failed key=${key} error=${[e?.name ?? "Error", e?.code].filter(Boolean).join(":")}`);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
