import postgres from "postgres";
import { assertKey, isSnapshot, type Snapshot, type SnapshotStore } from "./types";

/**
 * A parameter sent as a typed jsonb value, never as a pre-serialized string.
 * Passing `JSON.stringify(x)` to a jsonb parameter makes postgres.js encode
 * the string a second time, so the column holds a JSON string instead of
 * the object.
 */
export class JsonParam {
  constructor(readonly value: unknown) {}
}

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
  return sqlClientFrom(postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, ssl: "require" }));
}

/** Wraps a postgres.js instance; JsonParam values are sent as typed jsonb. */
export function sqlClientFrom(sql: postgres.Sql): SqlClient {
  return {
    async query(text, params) {
      const typed = params.map((p) => (p instanceof JsonParam ? sql.json(p.value as postgres.JSONValue) : p));
      const rows = await sql.unsafe(text, typed as postgres.ParameterOrJSON<never>[]);
      return { rows: rows as unknown as Array<Record<string, unknown>> };
    },
  };
}

/** The error class only: never a message that might carry a value. */
export function errorClass(err: unknown): string {
  const e = err as { name?: string; code?: string };
  return [e?.name ?? "Error", e?.code].filter(Boolean).join(":");
}

/**
 * Rows written before the jsonb fix hold `data` as a JSON string
 * (jsonb_typeof = 'string'). Snapshot data is never a bare string, so a
 * string is parsed once and used as the value; the next refresh rewrites
 * the row as an object. Nothing about the contents is logged.
 */
function decodeData(data: unknown, key: string): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    throw new Error(`Corrupt snapshot for ${key}`);
  }
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
    const snapshot = { schemaVersion: Number(row.schema_version), fetchedAt, data: decodeData(row.data, key) };
    if (!isSnapshot(snapshot)) throw new Error(`Corrupt snapshot for ${key}`);
    return snapshot as Snapshot<T>;
  }

  async put<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
    assertKey(key);
    // A top-level string would be indistinguishable from a legacy row.
    if (typeof snapshot.data === "string") throw new Error(`Snapshot data for ${key} must not be a bare string`);
    try {
      await this.client.query(
        `insert into ${TABLE} (key, schema_version, fetched_at, data, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (key) do update
         set schema_version = excluded.schema_version, fetched_at = excluded.fetched_at,
             data = excluded.data, updated_at = now()`,
        [key, snapshot.schemaVersion, snapshot.fetchedAt, new JsonParam(snapshot.data)],
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
