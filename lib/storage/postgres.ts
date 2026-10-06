import { assertKey, isSnapshot, type Snapshot, type SnapshotStore } from "./types";

/**
 * The narrow client surface this adapter needs. Any Postgres driver can be
 * wrapped to fit it. None is installed or connected yet: the database and
 * host are still to be chosen (docs/adr/0001-stack.md).
 */
export interface SqlClient {
  query(text: string, params: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Postgres-backed store over the `public_snapshots` table (db/migrations). */
export class PostgresSnapshotStore implements SnapshotStore {
  constructor(private readonly client: SqlClient) {}

  async get<T>(key: string): Promise<Snapshot<T> | null> {
    assertKey(key);
    const { rows } = await this.client.query(
      "select schema_version, fetched_at, data from public_snapshots where key = $1",
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    const fetchedAt = row.fetched_at instanceof Date ? row.fetched_at.toISOString() : String(row.fetched_at);
    const snapshot = { schemaVersion: Number(row.schema_version), fetchedAt, data: row.data };
    if (!isSnapshot(snapshot)) throw new Error(`Corrupt snapshot for ${key}`);
    return snapshot as Snapshot<T>;
  }

  async put<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
    assertKey(key);
    await this.client.query(
      `insert into public_snapshots (key, schema_version, fetched_at, data, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (key) do update
       set schema_version = excluded.schema_version, fetched_at = excluded.fetched_at,
           data = excluded.data, updated_at = now()`,
      [key, snapshot.schemaVersion, snapshot.fetchedAt, JSON.stringify(snapshot.data)],
    );
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.query("delete from public_snapshots where key = $1", [key]);
  }
}
