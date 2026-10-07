import { resolve } from "node:path";
import { FileSnapshotStore } from "./file";
import { createSqlClient, PostgresSnapshotStore } from "./postgres";
import type { SnapshotStore } from "./types";

export type { Snapshot, SnapshotStore } from "./types";

type Env = Readonly<Record<string, string | undefined>>;
/** `read` serves pages; `refresh` is the scheduled job, the only writer. */
export type StoreRole = "read" | "refresh";

export const DATABASE_URL_VARS: Record<StoreRole, string> = {
  read: "SNAPSHOT_DATABASE_URL_READ",
  refresh: "SNAPSHOT_DATABASE_URL_REFRESH",
};

/**
 * Validate storage configuration. Called at server start (instrumentation)
 * and whenever a store is created, so a missing URL fails loudly instead of
 * silently falling back. Messages name variables, never values.
 */
export function checkStorageConfig(env: Env = process.env): void {
  const kind = env.SNAPSHOT_STORE ?? "file";
  if (kind === "file") return;
  if (kind !== "postgres") throw new Error(`Unknown SNAPSHOT_STORE: ${kind}. Use "file" or "postgres".`);
  const missing = Object.values(DATABASE_URL_VARS).filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`SNAPSHOT_STORE=postgres needs ${missing.join(" and ")}. See docs/ops/database.md.`);
  }
}

const stores = new Map<StoreRole, SnapshotStore>();

/**
 * The configured snapshot store. `file` (the default) uses `SNAPSHOT_DIR`
 * (default `.data/snapshots`) for local work, tests and previews.
 * `postgres` connects as the reader role for page reads and as the
 * refresher role for the refresh job.
 */
export function getSnapshotStore(role: StoreRole = "read", env: Env = process.env): SnapshotStore {
  const cached = stores.get(role);
  if (cached) return cached;
  checkStorageConfig(env);
  const store =
    (env.SNAPSHOT_STORE ?? "file") === "postgres"
      ? new PostgresSnapshotStore(createSqlClient(env[DATABASE_URL_VARS[role]] as string))
      : new FileSnapshotStore(resolve(/*turbopackIgnore: true*/ env.SNAPSHOT_DIR ?? ".data/snapshots"));
  stores.set(role, store);
  return store;
}

/** Tests replace the store. */
export function setSnapshotStoreForTests(s: SnapshotStore | null): void {
  stores.clear();
  if (s) {
    stores.set("read", s);
    stores.set("refresh", s);
  }
}
