import postgres from "postgres";
import { assertKey, isSnapshot, type Snapshot, type SnapshotStore } from "./types";

/** The narrow client surface the adapter needs; tests supply a fake. */
export interface SqlClient {
  query(text: string, params: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const TABLE = "site.public_snapshots";

/**
 * A server-only postgres.js client for Supabase's shared pooler in
 * transaction mode (port 6543), which Supabase recommends for serverless
 * functions. Transaction mode does not support prepared statements, so they
 * are off. One connection per function instance; idle connections close.
 * https://supabase.com/docs/guides/database/connecting-to-postgres
 * https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
 */
export function createSqlClient(url: string): SqlClient {
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  return {
    async query(text, params) {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return { rows: rows as unknown as Array<Record<string, unknown>> };
    },
  };
}

/** The error class only: never a message that might carry a value. */
export function errorClass(err: unknown): string {
  const e = err as { name?: string; code?: string };
  return [e?.name ?? "Error", e?.code].filter(Boolean).join(":");
}

/** Postgres-backed store over `site.public_snapshots` (db/migrations). */
export class PostgresSnapshotStore implements SnapshotStore {
  constructor(
    private readonly client: SqlClient,
    private readonly log: (msg: string) => void = (m) => console.error(m),
  ) {}

  async get<T>(key: string): Promise<Snapshot<T> | null> {
    assertKey(key);
    const { rows } = await this.client.query(`select schema_version, fetched_at, data from ${TABLE} where key = $1`, [key]);
    const row = rows[0];
    if (!row) return null;
    const fetchedAt = row.fetched_at instanceof Date ? row.fetched_at.toISOString() : String(row.fetched_at);
    const snapshot = { schemaVersion: Number(row.schema_version), fetchedAt, data: row.data };
    if (!isSnapshot(snapshot)) throw new Error(`Corrupt snapshot for ${key}`);
    return snapshot as Snapshot<T>;
  }

  async put<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
    assertKey(key);
    try {
      await this.client.query(
        `insert into ${TABLE} (key, schema_version, fetched_at, data, updated_at)
         values ($1, $2, $3, $4::jsonb, now())
         on conflict (key) do update
         set schema_version = excluded.schema_version, fetched_at = excluded.fetched_at,
             data = excluded.data, updated_at = now()`,
        [key, snapshot.schemaVersion, snapshot.fetchedAt, JSON.stringify(snapshot.data)],
      );
    } catch (err) {
      this.log(`snapshots: write failed key=${key} error=${errorClass(err)}`);
      throw err;
    }
  }

  /** Not used by the site; the refresher role has no delete grant. */
  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.query(`delete from ${TABLE} where key = $1`, [key]);
  }
}
