import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { setSnapshotStoreForTests, type SnapshotStore } from "@/lib/storage";
import { FileSnapshotStore } from "@/lib/storage/file";

const SECRET = "synthetic-cron-secret-for-tests";

describe("cron authorization (D2)", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    for (const h of [null, "", SECRET, `Bearer ${SECRET} `, `bearer ${SECRET}`, `Bearer ${SECRET}x`, "Bearer "]) {
      expect(isAuthorizedCron(h, SECRET), String(h)).toBe(false);
    }
  });
  it("authorizes nothing when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});

describe("refresh route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setSnapshotStoreForTests(null);
  });
  const call = async (headers: Record<string, string> = {}, method = "GET") => {
    const mod = await import("@/app/api/cron/refresh/route");
    const handler = (mod as unknown as Record<string, (r: Request) => Promise<Response>>)[method] as (r: Request) => Promise<Response>;
    return handler(new Request("http://localhost/api/cron/refresh", { method, headers }));
  };

  it("returns 404 without the cron authorization, and for other methods", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(404);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(404);
    expect((await call({ authorization: `Bearer ${SECRET}` }, "POST")).status).toBe(404);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call({ authorization: "Bearer " })).status).toBe(404);
  });

  it("does nothing when UPSTREAM_REFRESH=off", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("UPSTREAM_REFRESH", "off");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, refresh: "off" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes feeds into the store when authorized", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("UPSTREAM_REFRESH", "");
    const dir = mkdtempSync(join(tmpdir(), "cron-"));
    setSnapshotStoreForTests(new FileSnapshotStore(dir));
    const xml = readFileSync("tests/fixtures/feeds/valid.xml", "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } })));
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jobs.streams).toEqual({ status: "ok", detail: { publications: { "the-human-butterfly": "updated" } } });
    expect(body.jobs.repos.status).toBe("ok");
    expect(readdirSync(dir)).toContain("stream__the-human-butterfly.json");
  });

  it("a failed repos write on the file store is that job's error, not a 500 (A3)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("UPSTREAM_REFRESH", "");
    const dir = mkdtempSync(join(tmpdir(), "cron-"));
    const file = new FileSnapshotStore(dir);
    const failing: SnapshotStore = {
      get: (k) => file.get(k),
      delete: (k) => file.delete(k),
      put: async (k, v) => {
        if (k === "code-repos") throw Object.assign(new Error("synthetic disk failure"), { code: "EACCES" });
        return file.put(k, v);
      },
    };
    setSnapshotStoreForTests(failing);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((m: string) => void errors.push(m));
    const xml = readFileSync("tests/fixtures/feeds/valid.xml", "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } })));
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.jobs.repos).toEqual({ status: "error" });
    expect(body.jobs.streams.status).toBe("ok");
    expect(readdirSync(dir)).toContain("stream__the-human-butterfly.json");
    expect(errors).toContain("cron: job repos failed error=Error:EACCES");
    expect(errors.join()).not.toContain("synthetic disk failure");
  });

  it("a stream whose refresh throws marks the streams job as failed and keeps the others", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("UPSTREAM_REFRESH", "");
    const dir = mkdtempSync(join(tmpdir(), "cron-"));
    const file = new FileSnapshotStore(dir);
    setSnapshotStoreForTests({
      get: (k) => file.get(k),
      delete: (k) => file.delete(k),
      put: async (k, v) => {
        if (k.startsWith("stream")) throw new Error("synthetic");
        return file.put(k, v);
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<rss/>")));
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs.streams.status).toBe("error");
    expect(body.jobs.streams.detail.publications["the-human-butterfly"]).toBe("error");
    expect(body.jobs.repos.status).toBe("ok");
  });
});

describe("pages never contact providers (D2)", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }
  it("only the cron route refreshes", () => {
    const offenders = files("app")
      .filter((f) => /\.(tsx?|mts)$/.test(f) && !f.startsWith(join("app", "api", "cron")))
      .filter((f) => /\bafter\(|refreshAll|refreshRepos|refreshPublication/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("schedules the job every fifteen minutes", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(cfg.crons).toEqual([{ path: "/api/cron/refresh", schedule: "*/15 * * * *" }]);
  });
});
