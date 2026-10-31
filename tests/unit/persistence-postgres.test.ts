import { readFileSync } from "node:fs";
import canonicalize from "canonicalize";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresSnapshotStore, sqlClientFrom } from "@/lib/storage/postgres";
import { leaseStore } from "@/lib/pulse/store";
import { validHistory } from "@/lib/pulse/validation";
import { syntheticPulse } from "../pulse-synthetic";

/**
 * Runs against a disposable local Postgres only, named by
 * SNAPSHOT_TEST_DATABASE_URL (CI starts a Postgres 16 service for it).
 * Without it, the suite is skipped. A non-local host is refused: these tests
 * never touch a hosted database.
 */
const url = process.env.SNAPSHOT_TEST_DATABASE_URL;
const local = url ? ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname) : false;
if (url && !local) throw new Error("SNAPSHOT_TEST_DATABASE_URL must point at a local, disposable database");

const canonical = (v: unknown) => canonicalize(v) as string;

describe.skipIf(!url)("postgres store against a local Postgres", () => {
  let sql: postgres.Sql;
  const pulseKey = `pulse:v1:${"c".repeat(32)}:recent`;
  const keys = ["test:object", "test:legacy", "test:roundtrip", "test:pulse"];

  beforeAll(async () => {
    sql = postgres(url as string, { prepare: false, max: 1, onnotice: () => {} });
    await sql.unsafe(readFileSync("db/migrations/0001_public_snapshots.sql", "utf8"));
    await sql.unsafe(readFileSync("db/migrations/0002_pulse_refresh_leases.sql", "utf8"));
    await sql`delete from site.pulse_refresh_leases where key = ${pulseKey}`;
    await sql`delete from site.public_snapshots where key = any(${keys})`;
  });

  afterAll(async () => {
    await sql`delete from site.pulse_refresh_leases where key = ${pulseKey}`;
    await sql`delete from site.public_snapshots where key = any(${keys})`;
    await sql.end();
  });

  const typeOf = async (key: string) =>
    (await sql`select jsonb_typeof(data) as t from site.public_snapshots where key = ${key}`)[0]?.t;

  it("coalesces 32 concurrent refresh leases through independent database connections", async () => {
    const pool = postgres(url as string, { prepare: false, max: 8, onnotice: () => {} });
    try {
      const leases = leaseStore(sqlClientFrom(pool));
      const now = Date.UTC(2026, 9, 31, 12);
      const winners = await Promise.all(Array.from({ length: 32 }, (_, i) => leases.claim(pulseKey, `synthetic-${i}`, now, now + 60_000)));
      expect(winners.filter(Boolean)).toHaveLength(1);
      expect(await leases.claim(pulseKey, "next-reader", now + 59_999, now + 120_000)).toBe(false);
      expect(await leases.claim(pulseKey, "next-reader", now + 60_000, now + 120_000)).toBe(true);
      await leases.defer(pulseKey, "previous-owner", now + 900_000);
      expect(await leases.claim(pulseKey, "final-reader", now + 120_000, now + 180_000)).toBe(true);
      await leases.defer(pulseKey, "final-reader", now + 900_000);
      expect(await leases.claim(pulseKey, "blocked-reader", now + 180_000, now + 240_000)).toBe(false);
    } finally { await pool.end(); }
  });

  it("preserves a last-good pulse projection across adapter restarts", async () => {
    const history = syntheticPulse().history.data!;
    await new PostgresSnapshotStore(sqlClientFrom(sql)).put("test:pulse", { schemaVersion: 1, fetchedAt: history.readAt, data: history });
    const restarted = new PostgresSnapshotStore(sqlClientFrom(sql));
    expect(validHistory((await restarted.get("test:pulse"))?.data)).toEqual(history);
  });

  it("keeps the lease table inaccessible to the page-reader role", async () => {
    const connection = await sql.reserve();
    try {
      await connection`set role site_reader`;
      await expect(connection`select * from site.pulse_refresh_leases`).rejects.toMatchObject({ code: "42501" });
    } finally { await connection`reset role`; connection.release(); }
  });

  it("writes data as a JSON object that SQL can query", async () => {
    const store = new PostgresSnapshotStore(sqlClientFrom(sql));
    await store.put("test:object", { schemaVersion: 1, fetchedAt: "2026-10-07T00:00:00.000Z", data: { n: 1, list: [1, 2] } });
    expect(await typeOf("test:object")).toBe("object");
    const [row] = await sql`select data->>'n' as n, jsonb_array_length(data->'list') as len from site.public_snapshots where key = 'test:object'`;
    expect(row).toEqual({ n: "1", len: 2 });
  });

  it("still reads a legacy row stored as a JSON string, and a refresh rewrites it as an object", async () => {
    const data = { title: "Legacy", items: [{ a: 1 }] };
    // The write the adapter made before this fix: a pre-serialized string into a jsonb parameter.
    await sql.unsafe(
      `insert into site.public_snapshots (key, schema_version, fetched_at, data) values ($1, $2, $3, $4::jsonb)`,
      ["test:legacy", 1, "2026-10-06T00:00:00.000Z", JSON.stringify(data)],
    );
    expect(await typeOf("test:legacy")).toBe("string");

    const store = new PostgresSnapshotStore(sqlClientFrom(sql));
    const read = await store.get("test:legacy");
    expect(read?.data).toEqual(data);

    await store.put("test:legacy", read!);
    expect(await typeOf("test:legacy")).toBe("object");
    expect((await store.get("test:legacy"))?.data).toEqual(data);
  });

  it("round-trips to byte-equal canonical JSON", async () => {
    const data = {
      text: "Marrs Rover — “quotes”, emoji 🚀, tab\tand newline\n",
      nested: { z: [true, false, null], a: { deep: [0, -1, 1.5, 1e21] } },
      empty: { list: [], obj: {} },
      // jsonb cannot hold \u0000 in any form (before or after this change), so it is not used here.
      unicode: "\u2028\u00e9",
    };
    const store = new PostgresSnapshotStore(sqlClientFrom(sql));
    await store.put("test:roundtrip", { schemaVersion: 2, fetchedAt: "2026-10-07T12:00:00.000Z", data });
    const read = await store.get("test:roundtrip");
    expect(Buffer.from(canonical(read?.data)).equals(Buffer.from(canonical(data)))).toBe(true);
    expect(read?.schemaVersion).toBe(2);
    expect(read?.fetchedAt).toBe("2026-10-07T12:00:00.000Z");
  });
});
