import "server-only";
import { getSnapshotStore } from "@/lib/storage";
import { createSqlClient, type SqlClient } from "@/lib/storage/postgres";
import type { Env } from "@/lib/flags";

export type PulseKind = "recent" | "history";
export interface PulseStore {
  load(key: string): Promise<unknown>;
  save(key: string, value: { readAt: string }): Promise<void>;
  claim(key: string, owner: string, now: number, until: number): Promise<boolean>;
  defer(key: string, owner: string, until: number): Promise<void>;
}

/** Atomic cross-instance lease. A failure consumes its slot too; no request-volume-dependent retries. */
export function leaseStore(sql: SqlClient): Pick<PulseStore, "claim" | "defer"> {
  return {
    async claim(key, owner, now, until) {
      const r = await sql.query(`insert into site.pulse_refresh_leases (key, owner, next_attempt_at)
        values ($1, $2, $3::timestamptz)
        on conflict (key) do update set owner = excluded.owner, next_attempt_at = excluded.next_attempt_at
        where site.pulse_refresh_leases.next_attempt_at <= $4::timestamptz returning owner`,
      [key, owner, new Date(until).toISOString(), new Date(now).toISOString()]);
      return r.rows[0]?.owner === owner;
    },
    async defer(key, owner, until) {
      await sql.query("update site.pulse_refresh_leases set next_attempt_at = greatest(next_attempt_at, $3::timestamptz) where key = $1 and owner = $2", [key, owner, new Date(until).toISOString()]);
    },
  };
}

/** Existing durable last-good projection store. Production never falls back to an ephemeral lease. */
export function pulseStore(env: Env = process.env): PulseStore {
  const read = () => getSnapshotStore("read", env);
  const write = () => getSnapshotStore("refresh", env);
  let lease: ReturnType<typeof leaseStore> | null = null;
  const leases = () => {
    if (env.SNAPSHOT_STORE !== "postgres" || !env.SNAPSHOT_DATABASE_URL_REFRESH) throw new Error("Pulse durable store unavailable");
    lease ??= leaseStore(createSqlClient(env.SNAPSHOT_DATABASE_URL_REFRESH));
    return lease;
  };
  return {
    async load(key) { const s = await read().get(key); return s?.schemaVersion === 1 ? s.data : null; },
    async save(key, value) { await write().put(key, { schemaVersion: 1, fetchedAt: value.readAt, data: value }); },
    claim: (key, owner, now, until) => leases().claim(key, owner, now, until),
    defer: (key, owner, until) => leases().defer(key, owner, until),
  };
}
