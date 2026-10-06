import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSnapshotStore } from "@/lib/storage/file";
import { PostgresSnapshotStore, type SqlClient } from "@/lib/storage/postgres";

const snap = { schemaVersion: 1, fetchedAt: "2026-09-01T00:00:00.000Z", data: { n: 1 } };

describe("file snapshot store", () => {
  it("round-trips and deletes", async () => {
    const s = new FileSnapshotStore(mkdtempSync(join(tmpdir(), "snap-")));
    expect(await s.get("stream:a")).toBeNull();
    await s.put("stream:a", snap);
    expect(await s.get("stream:a")).toEqual(snap);
    await s.delete("stream:a");
    expect(await s.get("stream:a")).toBeNull();
  });

  it("keeps the last good read across a restart (a new process reading the same directory)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snap-"));
    await new FileSnapshotStore(dir).put("stream:a", snap);
    const afterRestart = new FileSnapshotStore(dir);
    expect(await afterRestart.get("stream:a")).toEqual(snap);
  });

  it("refuses keys that could escape the directory", async () => {
    const s = new FileSnapshotStore(mkdtempSync(join(tmpdir(), "snap-")));
    for (const k of ["../x", "a/b", "", "A", "x".repeat(200)]) await expect(s.put(k, snap)).rejects.toThrow(/Invalid snapshot key/);
  });

  it("refuses a corrupt file instead of serving it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snap-"));
    writeFileSync(join(dir, "stream__a.json"), JSON.stringify({ nope: true }));
    await expect(new FileSnapshotStore(dir).get("stream:a")).rejects.toThrow(/Corrupt/);
  });

  it("writes whole files only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snap-"));
    const s = new FileSnapshotStore(dir);
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.put("stream:a", { ...snap, data: { n: i } })));
    expect(() => JSON.parse(readFileSync(join(dir, "stream__a.json"), "utf8"))).not.toThrow();
  });
});

describe("postgres snapshot store (adapter only; nothing is connected)", () => {
  function fakeClient() {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const rows = new Map<string, Record<string, unknown>>();
    const client: SqlClient = {
      async query(text, params) {
        calls.push({ text, params });
        if (text.startsWith("insert")) rows.set(String(params[0]), { schema_version: params[1], fetched_at: new Date(String(params[2])), data: JSON.parse(String(params[3])) });
        if (text.startsWith("delete")) rows.delete(String(params[0]));
        const row = rows.get(String(params[0]));
        return { rows: text.startsWith("select") && row ? [row] : [] };
      },
    };
    return { client, calls };
  }

  it("upserts, reads and deletes with parameterised SQL", async () => {
    const { client, calls } = fakeClient();
    const s = new PostgresSnapshotStore(client);
    await s.put("stream:a", snap);
    expect(await s.get("stream:a")).toEqual(snap);
    await s.delete("stream:a");
    expect(await s.get("stream:a")).toBeNull();
    expect(calls.every((c) => !c.text.includes("stream:a"))).toBe(true);
    expect(calls[0]?.text).toMatch(/on conflict \(key\) do update/);
  });
});
