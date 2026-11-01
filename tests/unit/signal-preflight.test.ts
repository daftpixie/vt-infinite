import { describe, expect, it, vi } from "vitest";
import { signalPreflight } from "@/scripts/signal-preflight.mjs";

describe("explicit read-only Signal preflight", () => {
  it("skips missing authorized bindings without any network or database access", async () => {
    const fetchImpl = vi.fn<typeof fetch>(); const database = vi.fn();
    const report = await signalPreflight({ env: {}, fetchImpl, database });
    expect(report.stats.status).toBe("skipped");
    expect(Object.values(report.database).every((result) => result.status === "skipped")).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled(); expect(database).not.toHaveBeenCalled();
  });
  it("validates a real-shaped aggregate without disclosing response details or credentials", async () => {
    const env = { PLAUSIBLE_SITE_ID: "synthetic.example", PLAUSIBLE_API_KEY: "synthetic-probe-credential" };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ results: [{ dimensions: [], metrics: [8] }], query: { private: "never-output" } }));
    const report = await signalPreflight({ env, fetchImpl });
    expect(report.stats).toMatchObject({ status: "valid", httpStatus: 200, valid: true });
    expect(JSON.stringify(report)).not.toMatch(/synthetic-probe|never-output|synthetic\.example/);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://plausible.io/api/v2/query");
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).metrics).toEqual(["pageviews"]);
  });
  it("keeps upstream/network/database errors out of the report", async () => {
    const report = await signalPreflight({ env: { PLAUSIBLE_SITE_ID: "synthetic.example", PLAUSIBLE_API_KEY: "synthetic-probe-credential", SNAPSHOT_DATABASE_URL_READ: "synthetic-connection" }, fetchImpl: async () => new Response("private error", { status: 403 }), database: () => { throw new Error("private connection detail"); } });
    expect(report.stats).toMatchObject({ httpStatus: 403, status: "unavailable", valid: false });
    expect(report.database.site_reader?.status).toBe("unavailable");
    expect(JSON.stringify(report)).not.toMatch(/private|synthetic-/);
  });
  it("uses fixed SELECTs through the read-only adapter and requires the expected role, login, grants and RLS", async () => {
    const queries: string[] = [];
    const checks = { role_matches: true, login_enabled: true, reader_snapshots: true, reader_leases: false, refresher_select: true, refresher_insert: true, refresher_update: true, rls: true };
    const report = await signalPreflight({ env: { SNAPSHOT_DATABASE_URL_READ: "synthetic-reader", SNAPSHOT_DATABASE_URL_REFRESH: "synthetic-refresher" }, database: () => ({ readOnly: async (query) => { queries.push(query); return query.includes("to_regclass") ? [{ snapshots: true, leases: true }] : [checks]; }, close: async () => {} }) });
    expect(Object.values(report.database).every((item) => item.status === "ready")).toBe(true);
    expect(queries.every((query) => query.startsWith("select "))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/synthetic-reader|synthetic-refresher/);
  });
});
