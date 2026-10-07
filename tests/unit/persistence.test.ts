import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStorageConfig, DATABASE_URL_VARS, getSnapshotStore, setSnapshotStoreForTests } from "@/lib/storage";
import { errorClass, PostgresSnapshotStore, type SqlClient } from "@/lib/storage/postgres";

const snap = { schemaVersion: 1, fetchedAt: "2026-10-06T00:00:00.000Z", data: { n: 1 } };

describe("storage configuration (D1)", () => {
  it("defaults to the file store", () => {
    expect(() => checkStorageConfig({})).not.toThrow();
  });
  it("fails at startup when postgres is selected without both URLs, naming variables only", () => {
    expect(() => checkStorageConfig({ SNAPSHOT_STORE: "postgres" })).toThrow(/SNAPSHOT_DATABASE_URL_READ and SNAPSHOT_DATABASE_URL_REFRESH/);
    // A fake URL with no real host or password: the test proves the message never echoes it.
    const env = { SNAPSHOT_STORE: "postgres", SNAPSHOT_DATABASE_URL_READ: "postgres://user:SECRETVALUE@host:6543/postgres" }; // secretlint-disable-line
    let message = "";
    try {
      checkStorageConfig(env);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/SNAPSHOT_DATABASE_URL_REFRESH/);
    expect(message).not.toContain("SECRETVALUE");
    expect(() => checkStorageConfig({ SNAPSHOT_STORE: "sqlite" })).toThrow(/Unknown SNAPSHOT_STORE/);
  });
  it("uses one store per role", () => {
    setSnapshotStoreForTests(null);
    const env = {
      SNAPSHOT_STORE: "postgres",
      [DATABASE_URL_VARS.read]: "postgres://reader.ref:x@localhost:6543/postgres",
      [DATABASE_URL_VARS.refresh]: "postgres://refresher.ref:x@localhost:6543/postgres",
    };
    const read = getSnapshotStore("read", env);
    const refresh = getSnapshotStore("refresh", env);
    expect(read).toBeInstanceOf(PostgresSnapshotStore);
    expect(refresh).not.toBe(read);
    setSnapshotStoreForTests(null);
  });
});

describe("postgres store", () => {
  it("reads and writes the table in the site schema with parameters", async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const client: SqlClient = {
      async query(text, params) {
        calls.push({ text, params });
        return { rows: text.startsWith("select") ? [{ schema_version: 1, fetched_at: new Date(snap.fetchedAt), data: snap.data }] : [] };
      },
    };
    const store = new PostgresSnapshotStore(client);
    await store.put("stream:a", snap);
    expect(await store.get("stream:a")).toEqual(snap);
    expect(calls.every((c) => c.text.includes("site.public_snapshots"))).toBe(true);
    expect(calls.every((c) => !c.text.includes("stream:a"))).toBe(true);
  });

  it("logs a failed write with the key and error class, then rethrows", async () => {
    const logs: string[] = [];
    const failing: SqlClient = {
      async query() {
        throw Object.assign(new Error("permission denied for table public_snapshots; password=hunter2"), { name: "PostgresError", code: "42501" });
      },
    };
    const store = new PostgresSnapshotStore(failing, (m) => logs.push(m));
    await expect(store.put("stream:a", snap)).rejects.toThrow();
    expect(logs).toEqual(["snapshots: write failed key=stream:a error=PostgresError:42501"]);
    expect(errorClass(new TypeError("x"))).toBe("TypeError");
  });

  it("the file store logs a failed write too", async () => {
    const { FileSnapshotStore } = await import("@/lib/storage/file");
    const dir = mkdtempSync(join(tmpdir(), "snap-"));
    // A file where the directory should be makes every write fail.
    const blocked = join(dir, "blocked");
    (await import("node:fs")).writeFileSync(blocked, "x");
    const errors: string[] = [];
    const orig = console.error;
    console.error = (m: string) => errors.push(m);
    try {
      await expect(new FileSnapshotStore(blocked).put("stream:a", snap)).rejects.toThrow();
    } finally {
      console.error = orig;
    }
    expect(errors[0]).toMatch(/^snapshots: write failed key=stream:a error=Error:E/);
  });
});

describe("migration (D1)", () => {
  const sql = readFileSync("db/migrations/0001_public_snapshots.sql", "utf8").toLowerCase();
  const code = sql.replace(/--.*$/gm, "");

  it("keeps the table in a dedicated schema with row level security", () => {
    expect(code).toMatch(/create schema if not exists site;/);
    expect(code).toMatch(/create table if not exists site\.public_snapshots/);
    expect(code).toMatch(/alter table site\.public_snapshots enable row level security;/);
    expect(code).not.toMatch(/\bpublic\.public_snapshots\b/);
  });
  it("revokes everything from public, anon, authenticated and service_role", () => {
    expect(code).toMatch(/revoke all on schema site from public;/);
    expect(code).toMatch(/revoke all on table site\.public_snapshots from public;/);
    expect(code).toMatch(/array\['anon', 'authenticated', 'service_role'\]/);
    expect(code).toMatch(/revoke all on schema site from %i/);
    expect(code).toMatch(/revoke all on table site\.public_snapshots from %i/);
  });
  it("creates NOLOGIN roles with least privilege and no passwords", () => {
    expect(code).toMatch(/create role site_reader nologin;/);
    expect(code).toMatch(/create role site_refresher nologin;/);
    expect(code).toMatch(/grant select on table site\.public_snapshots to site_reader;/);
    expect(code).toMatch(/grant select, insert, update on table site\.public_snapshots to site_refresher;/);
    expect(code).not.toMatch(/\bdelete\b.*to site_|\bgrant all\b|\bpassword\b|\blogin password\b/);
    expect(code).not.toMatch(/with login|\blogin\b(?! )/);
  });
});
