/**
 * Persistent storage for approved public snapshots (PRD §19, SS-5, A-8).
 * A snapshot is the last validated public projection of an upstream source.
 * Framework caches are never relied on for this: a deployment or cold start
 * must not erase the last good read.
 */
export type Snapshot<T> = {
  schemaVersion: number;
  /** ISO 8601 UTC time of the last successful read. */
  fetchedAt: string;
  data: T;
};

export interface SnapshotStore {
  get<T>(key: string): Promise<Snapshot<T> | null>;
  put<T>(key: string, snapshot: Snapshot<T>): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Keys are fixed by code, never taken from a request. */
export function assertKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9:-]{0,127}$/.test(key)) throw new Error(`Invalid snapshot key: ${JSON.stringify(key)}`);
}

export function isSnapshot(value: unknown): value is Snapshot<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.schemaVersion === "number" && typeof v.fetchedAt === "string" && !Number.isNaN(Date.parse(v.fetchedAt)) && "data" in v;
}
