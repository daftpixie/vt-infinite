import { readFileSync } from "node:fs";
import canonicalize from "canonicalize";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresSnapshotStore, sqlClientFrom } from "@/lib/storage/postgres";
import { leaseStore } from "@/lib/pulse/store";
import { validHistory } from "@/lib/pulse/validation";
import { syntheticPulse } from "../pulse-synthetic";
import { signalPreflight, type ProbeDatabase } from "@/scripts/signal-preflight.mjs";

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
  const roleKey = `pulse:v1:${"c".repeat(32)}:history`;
  const keys = ["test:object", "test:legacy", "test:roundtrip", "test:pulse", "test:pulse-role", "test:preflight", "test:preflight-policy"];

  beforeAll(async () => {
    sql = postgres(url as string, { prepare: false, max: 1, onnotice: () => {} });
    await sql.unsafe(readFileSync("db/migrations/0001_public_snapshots.sql", "utf8"));
    await sql.unsafe(readFileSync("db/migrations/0002_pulse_refresh_leases.sql", "utf8"));
    await sql`delete from site.pulse_refresh_leases where key in (${pulseKey}, ${roleKey})`;
    await sql`delete from site.public_snapshots where key = any(${keys})`;
  });

  afterAll(async () => {
    await sql`delete from site.pulse_refresh_leases where key in (${pulseKey}, ${roleKey})`;
    await sql`delete from site.public_snapshots where key = any(${keys})`;
    await sql.end();
  });

  const typeOf = async (key: string) =>
    (await sql`select jsonb_typeof(data) as t from site.public_snapshots where key = ${key}`)[0]?.t;

  describe("Signal preflight against actual restricted connections", () => {
    const roleUrl = (role: "site_reader" | "site_refresher") => {
      const connection = new URL(url as string);
      connection.username = role; connection.password = "";
      return connection.href;
    };
    // Only the disposable database lacks TLS. All catalog SQL comes from the actual preflight.
    const database = (connectionUrl: string): ProbeDatabase => {
      const connection = postgres(connectionUrl, { prepare: false, max: 1, onnotice: () => {} });
      return {
        readOnly: (query) => connection.begin("read only", async (tx) => {
          expect((await tx`select current_setting('transaction_read_only') as mode`)[0]?.mode).toBe("on");
          return [...await tx.unsafe(query)];
        }),
        close: () => connection.end(),
      };
    };
    const probe = () => signalPreflight({
      env: { SNAPSHOT_STORE: "postgres", SNAPSHOT_DATABASE_URL_READ: roleUrl("site_reader"), SNAPSHOT_DATABASE_URL_REFRESH: roleUrl("site_refresher"), PLAUSIBLE_SITE_ID: "synthetic.example", PLAUSIBLE_API_KEY: "synthetic-probe-credential" },
      fetchImpl: async () => Response.json({ results: [] }), // Successful empty Stats result; no upstream request.
      database,
    });

    beforeAll(async () => { await sql`alter role site_reader login`; await sql`alter role site_refresher login`; });
    afterAll(async () => { await sql`alter role site_reader nologin`; await sql`alter role site_refresher nologin`; });

    it("passes the complete grant contract and performs snapshot insert/update/read only on the disposable database", async () => {
      const report = await probe();
      expect(report.ready).toBe(true);
      for (const role of ["site_reader", "site_refresher"]) expect(report.database[role]).toMatchObject({ status: "ready", role_matches: true, login_enabled: true, refresher_snapshots_select: true, refresher_snapshots_insert: true, refresher_snapshots_update: true });
      const refresher = postgres(roleUrl("site_refresher"), { prepare: false, max: 1 });
      const reader = postgres(roleUrl("site_reader"), { prepare: false, max: 1 });
      try {
        const store = new PostgresSnapshotStore(sqlClientFrom(refresher));
        await store.put("test:preflight", { schemaVersion: 1, fetchedAt: "2026-11-01T12:00:00Z", data: { count: 1 } });
        await store.put("test:preflight", { schemaVersion: 1, fetchedAt: "2026-11-01T12:01:00Z", data: { count: 2 } });
        expect((await new PostgresSnapshotStore(sqlClientFrom(reader)).get("test:preflight"))?.data).toEqual({ count: 2 });
        for (const table of ["public_snapshots", "pulse_refresh_leases"]) await expect(refresher.unsafe(`delete from site.${table}`)).rejects.toMatchObject({ code: "42501" });
      } finally { await refresher.end(); await reader.end(); }
    });

    it.each(["select", "insert", "update"] as const)("rejects a missing refresher snapshot %s grant", async (privilege) => {
      try {
        await sql.unsafe(`revoke ${privilege} on site.public_snapshots from site_refresher`);
        const report = await probe();
        expect(report.ready).toBe(false); // The CLI maps this result to exit 2, never exit 0.
        for (const role of ["site_reader", "site_refresher"]) expect(report.database[role]).toMatchObject({ status: "not-ready", [`refresher_snapshots_${privilege}`]: false });
      } finally { await sql.unsafe(`grant ${privilege} on site.public_snapshots to site_refresher`); }
    });

    it.each([
      ["site_reader", "public_snapshots", "insert", "reader_snapshots_write"],
      ["site_reader", "public_snapshots", "update (data)", "reader_snapshots_write"],
      ["site_reader", "pulse_refresh_leases", "insert", "reader_leases_access"],
      ["site_reader", "pulse_refresh_leases", "select (key)", "reader_leases_access"],
      ["site_refresher", "public_snapshots", "delete", "refresher_snapshots_delete"],
      ["site_refresher", "pulse_refresh_leases", "delete", "refresher_leases_delete"],
    ] as const)("rejects prohibited %s %s %s access", async (role, table, privilege, field) => {
      try {
        await sql.unsafe(`grant ${privilege} on site.${table} to ${role}`);
        const report = await probe();
        expect(report.ready).toBe(false);
        expect(report.database.site_reader).toMatchObject({ status: "not-ready", [field]: true });
        expect(report.database.site_refresher?.status).toBe("not-ready");
      } finally { await sql.unsafe(`revoke ${privilege} on site.${table} from ${role}`); }
    });

    it("reports missing schema usage as not-ready rather than an unexplained connection failure", async () => {
      try {
        await sql`revoke usage on schema site from site_reader`;
        const report = await probe();
        expect(report.database.site_reader).toMatchObject({ status: "not-ready", schema_exists: true, schema_usage: false });
        expect(report.ready).toBe(false);
      } finally { await sql`grant usage on schema site to site_reader`; }
    });

    it("denies the reader snapshot writes and every lease data operation", async () => {
      const reader = postgres(roleUrl("site_reader"), { prepare: false, max: 1 });
      try {
        for (const query of [
          "insert into site.public_snapshots (key, schema_version, fetched_at, data) values ('test:preflight', 1, now(), '{}')",
          "update site.public_snapshots set data = '{}' where key = 'test:preflight'",
          "delete from site.public_snapshots where key = 'test:preflight'", "truncate site.public_snapshots",
          "select * from site.pulse_refresh_leases",
          "insert into site.pulse_refresh_leases (key, owner, next_attempt_at) values ('invalid-test-key', 'synthetic', now())",
          "update site.pulse_refresh_leases set owner = 'synthetic'", "delete from site.pulse_refresh_leases", "truncate site.pulse_refresh_leases",
        ]) await expect(reader.unsafe(query)).rejects.toMatchObject({ code: "42501" });
      } finally { await reader.end(); }
    });

    it("distinguishes passing catalog checks from an actual policy-authorized write", async () => {
      const refresher = postgres(roleUrl("site_refresher"), { prepare: false, max: 1 });
      try {
        await sql`drop policy snapshots_insert on site.public_snapshots`;
        expect((await probe()).ready).toBe(true); // Enabled RLS + grants do not inspect policy semantics.
        await expect(new PostgresSnapshotStore(sqlClientFrom(refresher)).put("test:preflight-policy", { schemaVersion: 1, fetchedAt: "2026-11-01T12:00:00Z", data: {} })).rejects.toMatchObject({ code: "42501" });
      } finally {
        await sql`create policy snapshots_insert on site.public_snapshots for insert to site_refresher with check (true)`;
        await refresher.end();
      }
    });
  });

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

  it("runs actual lease/projection writes as the refresher, and read-only projection access as the reader", async () => {
    const connection = await sql.reserve();
    const client = sqlClientFrom(connection as unknown as postgres.Sql);
    const store = new PostgresSnapshotStore(client, () => {});
    try {
      await connection`set role site_refresher`;
      const lease = leaseStore(client);
      const now = Date.UTC(2026, 10, 1, 12);
      expect(await lease.claim(roleKey, "synthetic-refresher", now, now + 300_000)).toBe(true);
      const data = syntheticPulse().history.data!;
      await store.put("test:pulse-role", { schemaVersion: 1, fetchedAt: data.readAt, data });
      await connection`reset role`;
      await connection`set role site_reader`;
      expect((await store.get("test:pulse-role"))?.data).toEqual(data);
      await expect(store.put("test:pulse-role", { schemaVersion: 1, fetchedAt: data.readAt, data })).rejects.toMatchObject({ code: "42501" });
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
