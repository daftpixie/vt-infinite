import { resolve } from "node:path";
import { FileSnapshotStore } from "./file";
import type { SnapshotStore } from "./types";

export type { Snapshot, SnapshotStore } from "./types";

let store: SnapshotStore | null = null;

/**
 * The configured snapshot store. `SNAPSHOT_STORE=file` (the default) uses
 * `SNAPSHOT_DIR` (default `.data/snapshots`). `postgres` is reserved for the
 * Postgres adapter once a database is chosen and a driver is wired; until
 * then it fails loudly rather than silently losing data.
 */
export function getSnapshotStore(env: Readonly<Record<string, string | undefined>> = process.env): SnapshotStore {
  if (store) return store;
  const kind = env.SNAPSHOT_STORE ?? "file";
  if (kind === "file") {
    store = new FileSnapshotStore(resolve(/*turbopackIgnore: true*/ env.SNAPSHOT_DIR ?? ".data/snapshots"));
    return store;
  }
  if (kind === "postgres") {
    throw new Error("SNAPSHOT_STORE=postgres is not wired: no database has been provisioned or connected.");
  }
  throw new Error(`Unknown SNAPSHOT_STORE: ${kind}`);
}

/** Tests replace the store. */
export function setSnapshotStoreForTests(s: SnapshotStore | null): void {
  store = s;
}
