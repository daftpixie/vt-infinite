import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkVisibility, readRepos, refreshRepos, REPOS, ReposConfigSchema, statusesDueForReview, type ReposConfig } from "@/lib/code/repos";
import { FileSnapshotStore } from "@/lib/storage/file";
import { isStatusLabel } from "@/lib/status";

const entry = {
  owner: "synthetic-owner",
  repo: "synthetic-repo",
  description: "Synthetic description.",
  initiative: "Synthetic initiative",
  status: "In build" as const,
  statusDate: "2026-09-28",
  evidenceUrl: "https://example.com/evidence",
  listingApproved: true as const,
};
const cfg: ReposConfig = { schemaVersion: 1, repos: [entry] };
const api = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const publicBody = { full_name: "synthetic-owner/synthetic-repo", private: false, visibility: "public", license: { spdx_id: "Apache-2.0" }, language: "TypeScript", pushed_at: "2026-10-01T00:00:00Z", stargazers_count: 999 };

describe("repository allowlist (G-1, G-3)", () => {
  it("ships empty, in a valid file", () => {
    expect(REPOS.repos).toEqual([]);
  });
  it("needs every approved field and the approved status vocabulary", () => {
    expect(ReposConfigSchema.safeParse(cfg).success).toBe(true);
    expect(ReposConfigSchema.safeParse({ ...cfg, repos: [{ ...entry, status: "Launched" }] }).success).toBe(false);
    expect(ReposConfigSchema.safeParse({ ...cfg, repos: [{ ...entry, evidenceUrl: undefined }] }).success).toBe(false);
    expect(ReposConfigSchema.safeParse({ ...cfg, repos: [{ ...entry, stars: 5 }] }).success).toBe(false);
    expect(ReposConfigSchema.safeParse({ ...cfg, repos: [{ ...entry, status: "Paused" }] }).success).toBe(false);
    expect(ReposConfigSchema.safeParse({ ...cfg, repos: [entry, entry] }).success).toBe(false);
    expect(isStatusLabel("Stewarded by A Steward")).toBe(true);
    expect(isStatusLabel("Built")).toBe(false);
  });
  it("flags statuses older than 90 days for review (Q-5)", () => {
    expect(statusesDueForReview(new Date("2026-12-28T00:00:00Z"), cfg)).toHaveLength(1);
    expect(statusesDueForReview(new Date("2026-10-06T00:00:00Z"), cfg)).toHaveLength(0);
  });
});

describe("visibility check (G-2, G-4)", () => {
  it("accepts only a confirmed public repository, and reads no counts", async () => {
    const r = await checkVisibility(entry, api(publicBody));
    expect(r).toEqual({ kind: "public", etag: null, meta: { owner: entry.owner, repo: entry.repo, license: "Apache-2.0", language: "TypeScript", pushedAt: "2026-10-01T00:00:00.000Z" } });
    expect(JSON.stringify(r)).not.toContain("999");
  });
  it("treats private, missing, renamed and unknown visibility as not public", async () => {
    expect((await checkVisibility(entry, api({ ...publicBody, private: true }))).kind).toBe("not-public");
    expect((await checkVisibility(entry, api({}, 404))).kind).toBe("not-public");
    expect((await checkVisibility(entry, api({ ...publicBody, visibility: "internal" }))).kind).toBe("not-public");
  });
  it("treats a redirect (renamed or transferred repository) as moved", async () => {
    expect((await checkVisibility(entry, async () => new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } }))).kind).toBe("moved");
    expect((await checkVisibility(entry, api({ ...publicBody, full_name: "synthetic-owner/new-name" }))).kind).toBe("moved");
  });
  it("sends the stored ETag and never follows redirects", async () => {
    let seen: RequestInit | undefined;
    const r = await checkVisibility(
      entry,
      async (_u, init) => {
        seen = init;
        return new Response(null, { status: 304 });
      },
      'W/"abc"',
    );
    expect(r.kind).toBe("not-modified");
    expect((seen?.headers as Record<string, string>)["If-None-Match"]).toBe('W/"abc"');
    expect(seen?.redirect).toBe("manual");
  });
  it("calls a provider failure unavailable, not public", async () => {
    expect((await checkVisibility(entry, api({}, 500))).kind).toBe("unavailable");
    expect((await checkVisibility(entry, api({}, 403))).kind).toBe("unavailable");
    expect((await checkVisibility(entry, async () => Promise.reject(new Error("down")))).kind).toBe("unavailable");
  });
});

describe("snapshot (G-2, stale labels)", () => {
  const t0 = new Date("2026-10-01T00:00:00Z");
  const later = (h: number) => () => new Date(t0.getTime() + h * 3600_000);
  const fresh = () => new FileSnapshotStore(mkdtempSync(join(tmpdir(), "code-")));

  it("never promotes an entry that was not confirmed public", async () => {
    const store = fresh();
    await refreshRepos({ store, cfg, fetchImpl: api({}, 500), now: () => t0, env: {} });
    expect(await readRepos({ store, cfg, now: () => t0 })).toEqual([]);
  });
  it("keeps an earlier confirmation through an outage, labeled stale", async () => {
    const store = fresh();
    await refreshRepos({ store, cfg, fetchImpl: api(publicBody), now: () => t0, env: {} });
    await refreshRepos({ store, cfg, fetchImpl: api({}, 500), now: later(30), env: {} });
    const [view] = await readRepos({ store, cfg, now: later(30) });
    expect(view?.stale).toBe(true);
    expect(view?.meta.confirmedPublicAt).toBe(t0.toISOString());
  });
  it("withdraws a listing as soon as the repository is no longer public", async () => {
    const store = fresh();
    await refreshRepos({ store, cfg, fetchImpl: api(publicBody), now: () => t0, env: {} });
    await refreshRepos({ store, cfg, fetchImpl: api({ ...publicBody, private: true }), now: later(2), env: {} });
    expect(await readRepos({ store, cfg, now: later(2) })).toEqual([]);
  });
  it("revalidates with the ETag and keeps a 304 as confirmed now", async () => {
    const store = fresh();
    const withEtag = async () => new Response(JSON.stringify(publicBody), { status: 200, headers: { "content-type": "application/json", etag: '"v1"' } });
    await refreshRepos({ store, cfg, fetchImpl: withEtag, now: () => t0, env: {} });
    let sent: string | undefined;
    await refreshRepos({
      store,
      cfg,
      fetchImpl: async (_u, init) => {
        sent = (init.headers as Record<string, string>)["If-None-Match"];
        return new Response(null, { status: 304 });
      },
      now: later(2),
      env: {},
    });
    expect(sent).toBe('"v1"');
    const [view] = await readRepos({ store, cfg, now: later(2) });
    expect(view?.meta.confirmedPublicAt).toBe(later(2)().toISOString());
  });
  it("hides a moved repository at once and reports it for review", async () => {
    const store = fresh();
    await refreshRepos({ store, cfg, fetchImpl: api(publicBody), now: () => t0, env: {} });
    const logs: string[] = [];
    const report = await refreshRepos({ store, cfg, fetchImpl: async () => new Response(null, { status: 301 }), now: later(2), env: {}, log: (m) => logs.push(m) });
    expect(report.moved).toEqual(["synthetic-owner/synthetic-repo"]);
    expect(logs[0]).toMatch(/moved or renamed/);
    expect(await readRepos({ store, cfg, now: later(2) })).toEqual([]);
  });
  it("respects the refresh floor and the offline switch", async () => {
    const store = fresh();
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return api(publicBody)();
    };
    await refreshRepos({ store, cfg, fetchImpl: counting, now: () => t0, env: {} });
    await refreshRepos({ store, cfg, fetchImpl: counting, now: later(0.5), env: {} });
    await refreshRepos({ store, cfg, fetchImpl: counting, now: later(5), env: { UPSTREAM_REFRESH: "off" } });
    expect(calls).toBe(1);
  });
});
