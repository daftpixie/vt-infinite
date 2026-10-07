import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBody, PlanSummary } from "@/components/plan";
import { decide } from "@/lib/access";
import { CRISIS_SUPPORT_TEXT } from "@/lib/crisis";
import { ALLOWED_ENDPOINTS, assertAllowed, MAX_PAGES, PlanReadError, readPlanSource } from "@/lib/plan/asana";
import { keyAllocator, keyIndexDigest, MAX_KEY_INDEX_ENTRIES, type KeyIndex } from "@/lib/plan/keys";
import { resetTokenCacheForTests, TOKEN_URL } from "@/lib/plan/oauth";
import { PLAN_STALE_AFTER_MS, pollPlanOnce, restale, startPlanPolling } from "@/lib/plan/poller";
import { cleanTitle, MAX_TITLE, projectPlan, stepCounts, type PlanInitiative } from "@/lib/plan/projection";
import { isShown, PLAN_KEYS, readPlan, refreshPlan, type PlanControl, type PublicPlanState } from "@/lib/plan/service";
import { setSnapshotStoreForTests, type SnapshotStore } from "@/lib/storage";
import { FileSnapshotStore } from "@/lib/storage/file";

// Pages call connection(); outside a request it is a no-op here.
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

// Recorded synthetic fixtures only (tests/fixtures/asana/README.md).
const FIX = "tests/fixtures/asana";
const fixture = (name: string) => readFileSync(join(FIX, name), "utf8");

const ENV = {
  PLAN_ENABLED: "true",
  ASANA_PLAN_PROJECT_ID: "9001",
  ASANA_PLAN_CLIENT_ID: "synthetic-client",
  ASANA_PLAN_CLIENT_SECRET: "synthetic-client-secret",
  ASANA_PLAN_REFRESH_TOKEN: "synthetic-refresh-token",
  PLAN_KEY_SECRET: "synthetic-key-secret-at-least-32-characters",
};

type Call = { url: string; method: string };

/** Answers Asana-shaped requests from the fixture files; `override` replaces one route. */
function asana(override: (u: URL) => Response | null = () => null) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
    calls.push({ url: input, method: init.method ?? "GET" });
    if (input === TOKEN_URL) return new Response(fixture("oauth-token.json"), { headers: { "content-type": "application/json" } });
    const u = new URL(input);
    const o = override(u);
    if (o) return o;
    const offset = u.searchParams.get("offset");
    const file =
      u.pathname === "/api/1.0/projects/9001/tasks"
        ? offset === "synthetic-offset-2"
          ? "project-tasks-2.json"
          : "project-tasks-1.json"
        : (() => {
            const m = /^\/api\/1\.0\/tasks\/(\d+)\/subtasks$/.exec(u.pathname);
            if (!m) return null;
            if (m[1] === "9101") return offset ? "subtasks-9101-2.json" : "subtasks-9101-1.json";
            return `subtasks-${m[1]}.json`;
          })();
    if (!file) return new Response("{}", { status: 404 });
    return new Response(fixture(file), { headers: { "content-type": "application/json" } });
  });
  return { fetchImpl, calls };
}

const store = () => {
  const dir = mkdtempSync(join(tmpdir(), "plan-"));
  return { dir, s: new FileSnapshotStore(dir) };
};
const t0 = new Date("2026-10-07T12:00:00Z");
const quiet = () => {};

beforeEach(() => resetTokenCacheForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setSnapshotStoreForTests(null);
});

describe("read-only client (A-2, A-3, A-7)", () => {
  it("allows only GET on the two allowlisted endpoints", () => {
    expect(assertAllowed("GET", "/projects/9001/tasks").name).toBe("project-tasks");
    expect(assertAllowed("GET", "/tasks/9101/subtasks").name).toBe("subtasks");
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "get", "HEAD"]) {
      expect(() => assertAllowed(m, "/projects/9001/tasks"), m).toThrow(PlanReadError);
    }
    for (const p of ["/tasks/9101", "/tasks/9101/stories", "/projects/9001", "/workspaces", "/projects/9001/tasks/extra", "/projects/x/tasks", "/webhooks", "/tasks/9101/subtasks?x=1"]) {
      expect(() => assertAllowed("GET", p), p).toThrow(/not allowlisted/);
    }
    expect(ALLOWED_ENDPOINTS).toHaveLength(2);
  });

  it("has no write method in its source; the only POST in plan code is the OAuth token exchange", () => {
    const client = readFileSync("lib/plan/asana.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(client).not.toMatch(/["'`](?:POST|PUT|PATCH|DELETE)["'`]/);
    expect(client.match(/method: "/g)).toHaveLength(1);
    expect(client).toMatch(/method: "GET"/);
    const oauth = readFileSync("lib/plan/oauth.ts", "utf8");
    expect(oauth.match(/method: "POST"/g)).toHaveLength(1);
    expect(oauth).toContain('TOKEN_URL = "https://app.asana.com/-/oauth_token"');
    for (const f of readdirSync("lib/plan")) {
      if (f === "oauth.ts") continue;
      expect(readFileSync(join("lib/plan", f), "utf8"), f).not.toMatch(/method: ["'`](?:POST|PUT|PATCH|DELETE)/);
    }
  });

  it("reads every page with only the needed fields, and every request is an allowlisted GET", async () => {
    const { fetchImpl, calls } = asana();
    const source = await readPlanSource("9001", { token: "t", fetchImpl });
    expect(source.map((s) => s.task.gid)).toEqual(["9101", "9102", "9103", "9104"]);
    expect(calls.some((c) => c.url.includes("offset=synthetic-offset-2"))).toBe(true);
    expect(calls.some((c) => c.url.includes("offset=synthetic-offset-9101-2"))).toBe(true);
    for (const c of calls) {
      const u = new URL(c.url);
      expect(c.method).toBe("GET");
      expect(() => assertAllowed("GET", u.pathname.replace("/api/1.0", ""))).not.toThrow();
      expect(u.searchParams.get("limit")).toBe("100");
      expect(u.searchParams.get("opt_fields")).toMatch(/^name,completed,due_on,resource_subtype(,parent)?$/);
    }
  });

  it("subtasks render once, under their parent, in source order", async () => {
    const source = await readPlanSource("9001", { token: "t", fetchImpl: asana().fetchImpl });
    expect(source[0]?.subtasks.map((s) => s.gid)).toEqual(["9201", "9202", "9203"]);
    expect(source.some((s) => s.task.gid === "9203")).toBe(false);
    expect(source.some((s) => s.task.resource_subtype === "section")).toBe(false);
  });

  it("drops every field the projection does not use, at the boundary", async () => {
    const source = await readPlanSource("9001", { token: "t", fetchImpl: asana().fetchImpl });
    const json = JSON.stringify(source);
    for (const f of ["notes", "assignee", "followers", "tags", "custom_fields", "permalink_url", "SYNTHETIC", "resource_type"]) expect(json).not.toContain(f);
  });

  it("fails the whole read when any page or subtask read fails", async () => {
    const page2 = asana((u) => (u.searchParams.get("offset") === "synthetic-offset-2" ? new Response("{}", { status: 500 }) : null));
    await expect(readPlanSource("9001", { token: "t", fetchImpl: page2.fetchImpl })).rejects.toThrow(/HTTP 500/);
    const sub = asana((u) => (u.pathname.endsWith("/tasks/9103/subtasks") ? new Response("{}", { status: 503 }) : null));
    await expect(readPlanSource("9001", { token: "t", fetchImpl: sub.fetchImpl })).rejects.toThrow(/subtasks: HTTP 503/);
    const bad = asana((u) => (u.pathname.endsWith("/tasks/9102/subtasks") ? new Response('{"data":[{"gid":"x"}]}') : null));
    await expect(readPlanSource("9001", { token: "t", fetchImpl: bad.fetchImpl })).rejects.toThrow(/unexpected shape/);
    const net = asana((u) => (u.pathname.endsWith("/tasks/9101/subtasks") ? (() => { throw new TypeError("synthetic"); })() : null));
    await expect(readPlanSource("9001", { token: "t", fetchImpl: net.fetchImpl })).rejects.toThrow(/network/);
  });

  it("refuses endless or looping pagination rather than publish part of the plan", async () => {
    const loop = asana((u) =>
      u.pathname.endsWith("/projects/9001/tasks") ? new Response(JSON.stringify({ data: [], next_page: { offset: "same" } })) : null,
    );
    await expect(readPlanSource("9001", { token: "t", fetchImpl: loop.fetchImpl })).rejects.toThrow(/repeated an offset/);
    let n = 0;
    const endless = asana((u) =>
      u.pathname.endsWith("/projects/9001/tasks") ? new Response(JSON.stringify({ data: [], next_page: { offset: `o${n++}` } })) : null,
    );
    await expect(readPlanSource("9001", { token: "t", fetchImpl: endless.fetchImpl })).rejects.toThrow(new RegExp(`more than ${MAX_PAGES} pages`));
  });

  it("refuses a project ID that is not an identifier, before any request", async () => {
    const { fetchImpl } = asana();
    await expect(readPlanSource("9001/../../workspaces", { token: "t", fetchImpl })).rejects.toThrow(/not a valid identifier/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("projection (A-5, A-6)", () => {
  const project = async (env: Record<string, string> = {}) => {
    const source = await readPlanSource("9001", { token: "t", fetchImpl: asana().fetchImpl });
    const logs: string[] = [];
    const keys = keyAllocator(null, ENV.PLAN_KEY_SECRET, { now: t0 });
    return { p: projectPlan(source, { keyFor: keys.keyFor, env, log: (m) => logs.push(m) }), logs, keys };
  };

  it("keeps order, done/open, due dates and milestones; nothing else", async () => {
    const { p } = await project();
    expect(p.initiatives.map((i) => [i.title, i.milestone, i.completed, i.dueOn])).toEqual([
      ["Synthetic initiative one", false, false, "2026-11-30"],
      ["Synthetic milestone initiative", true, false, "2026-12-01"],
      ["Synthetic initiative three", false, true, null],
    ]);
    expect(p.initiatives[0]?.steps.map((s) => [s.title, s.milestone, s.completed, s.dueOn])).toEqual([
      ["Synthetic step one", false, true, "2026-10-01"],
      ["Synthetic milestone step", true, false, "2026-11-02"],
      ["Synthetic step three", false, false, null],
    ]);
    expect(p.initiatives[2]?.steps.map((s) => [s.title, s.milestone])).toEqual([
      ["Synthetic native milestone", true],
      ["<script>alert('synthetic')</script> Synthetic step with markup", false],
    ]);
    for (const i of p.initiatives) {
      expect(Object.keys(i).sort()).toEqual(["completed", "dueOn", "key", "mentionsSuicide", "milestone", "steps", "title"]);
      for (const s of i.steps) expect(Object.keys(s).sort()).toEqual(["completed", "dueOn", "key", "mentionsSuicide", "milestone", "title"]);
    }
    expect(stepCounts(p.initiatives[0] as never)).toEqual({ done: 1, open: 2 });
  });

  it("withholds guard hits; a withheld initiative takes its steps, and counts leave them out; logs carry no text", async () => {
    const { p, logs } = await project();
    expect(p.withheld).toEqual({ initiatives: 1, steps: 1 });
    const text = JSON.stringify(p);
    for (const hidden of ["MIRmade", "synthetic@example.com", "withheld initiative"]) expect(text).not.toContain(hidden);
    expect(stepCounts(p.initiatives[2] as never)).toEqual({ done: 1, open: 1 });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/plan-other-initiative=1/);
    expect(logs[0]).toMatch(/plan-email=1/);
    expect(logs[0]).not.toMatch(/MIRmade|example\.com|Synthetic/);
  });

  it.each([
    ["names MIRmade", "Synthetic plan step about MIRmade"],
    ["claims a handoff", "Synthetic handoff to a steward"],
    ["claims ownership", "Synthetic step: belongs to VT Infinite"],
    ["carries an email", "Write to synthetic@example.com"],
    ["carries a phone number", "Call +1 555 010 0199"],
    ["carries a link", "See https://app.asana.com/0/1/2"],
    ["carries a long ID", `Synthetic ${"12345678".repeat(2)}`],
    ["mentions the PBC", "Synthetic PBC filing"],
    ["is a funding ask", "Synthetic: fund us"],
    ["uses a brand-avoided word", "Synthetic step to unlock access"],
    ["is empty after the prefix", "Milestone:   "],
  ])("withholds a title that %s", (_why, name) => {
    const p = projectPlan([{ task: { gid: "1", name, completed: false }, subtasks: [] }], { keyFor: () => "k", env: {}, log: quiet });
    expect(p.initiatives).toEqual([]);
    expect(p.withheld.initiatives).toBe(1);
  });

  it("withholds a private identifier and the project's own ID, both from the environment", () => {
    const env = { PRIVATE_IDENTIFIERS: "Synthetic Private Name", ASANA_PLAN_PROJECT_ID: "424242" };
    const run = (name: string) => projectPlan([{ task: { gid: "1", name, completed: false }, subtasks: [] }], { keyFor: () => "k", env, log: quiet });
    expect(run("Step for synthetic-private-name").initiatives).toEqual([]);
    expect(run("Step 424242").initiatives).toEqual([]);
    expect(run("Ship by 2026-10-07").initiatives).toHaveLength(1);
  });

  it("keeps dates; cleans control characters; limits titles to 200 characters", () => {
    expect(cleanTitle("A\u0000b\u202e c\n\t d\u200b\u2066e\ufeff")).toBe("A b c d e");
    const long = "S".repeat(250);
    const p = projectPlan([{ task: { gid: "1", name: long, completed: false }, subtasks: [] }], { keyFor: () => "k", env: {}, log: quiet });
    expect(Array.from(p.initiatives[0]?.title ?? "")).toHaveLength(MAX_TITLE);
    expect(p.initiatives[0]?.title.endsWith("…")).toBe(true);
  });

  it("generates public keys that are random, stable across reads and not derived from provider IDs", async () => {
    const first = await project();
    const keys1 = first.p.initiatives.flatMap((i) => [i.key, ...i.steps.map((s) => s.key)]);
    for (const k of keys1) {
      expect(k).toMatch(/^s[A-Za-z0-9]{12}$/);
      expect(k).not.toMatch(/9\d{3}/);
    }
    expect(new Set(keys1).size).toBe(keys1.length);
    const second = projectPlan(await readPlanSource("9001", { token: "t", fetchImpl: asana().fetchImpl }), {
      keyFor: keyAllocator(first.keys.index(), ENV.PLAN_KEY_SECRET, { now: t0 }).keyFor,
      env: {},
      log: quiet,
    });
    expect(second.initiatives.flatMap((i) => [i.key, ...i.steps.map((s) => s.key)])).toEqual(keys1);
    expect(JSON.stringify(first.keys.index())).not.toMatch(/"9\d{3}"/);
  });
});

describe("refresh and read (A-4, A-8)", () => {
  const refresh = (s: SnapshotStore, over: Partial<Parameters<typeof refreshPlan>[0]> = {}) =>
    refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: asana().fetchImpl, log: quiet, ...over });
  const setControl = (s: SnapshotStore, data: PlanControl) => s.put(PLAN_KEYS.control, { schemaVersion: 1, fetchedAt: t0.toISOString(), data });

  it("persists only the projection: no provider ID, field or raw payload reaches the store", async () => {
    const { dir, s } = store();
    expect(await refresh(s)).toBe("updated");
    const all = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const f of ["notes", "assignee", "followers", "tags", "custom_fields", "permalink", "SYNTHETIC", "resource_subtype", "gid", "synthetic-access-token", "synthetic-refresh-token", "MIRmade", "example.com"]) {
      expect(all, f).not.toContain(f);
    }
    expect(all).not.toMatch(/\b9[12]\d{2}\b|\b9001\b/);
    const state = await readPlan({ store: s, env: ENV, now: () => t0 });
    expect(state.status).toBe("fresh");
  });

  it("reads at most once a minute", async () => {
    const { s } = store();
    const a = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: a.fetchImpl, log: quiet })).toBe("updated");
    const n = a.calls.length;
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 59_000), fetchImpl: a.fetchImpl, log: quiet })).toBe("skipped");
    expect(a.calls.length).toBe(n);
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 60_000), fetchImpl: a.fetchImpl, log: quiet })).toBe("updated");
  });

  it("keeps the last good projection and its read time when a read fails, then marks it stale after 30 minutes", async () => {
    const { s } = store();
    await refresh(s);
    const later = new Date(t0.getTime() + 31 * 60_000);
    const failing = asana((u) => (u.pathname.endsWith("/tasks/9102/subtasks") ? new Response("{}", { status: 500 }) : null));
    expect(await refreshPlan({ store: s, env: ENV, now: () => later, fetchImpl: failing.fetchImpl, log: quiet })).toBe("failed");
    const state = await readPlan({ store: s, env: ENV, now: () => later });
    expect(state.status).toBe("stale");
    expect(state.status === "stale" && state.readAt).toBe(t0.toISOString());
    expect(state.status === "stale" && state.initiatives).toHaveLength(3);
    expect((await readPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 29 * 60_000) })).status).toBe("fresh");
  });

  it("a token failure fails the read the same way, and backs off", async () => {
    const { s } = store();
    const denied = vi.fn(async () => new Response("{}", { status: 401 }));
    const logs: string[] = [];
    expect(await refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: denied, log: (m) => logs.push(m) })).toBe("failed");
    expect(logs.join()).toMatch(/token: HTTP 401/);
    expect(logs.join()).not.toContain("synthetic-refresh-token");
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 30_000), fetchImpl: denied, log: quiet })).toBe("skipped");
    expect((await readPlan({ store: s, env: ENV, now: () => t0 })).status).toBe("unavailable");
  });

  it("holds an empty successful read for review: the previous plan is neither erased nor shown", async () => {
    const { s } = store();
    await refresh(s);
    const empty = asana((u) => (u.pathname.endsWith("/projects/9001/tasks") ? new Response('{"data":[],"next_page":null}') : null));
    const t1 = new Date(t0.getTime() + 120_000);
    expect(await refreshPlan({ store: s, env: ENV, now: () => t1, fetchImpl: empty.fetchImpl, log: quiet })).toBe("held-empty");
    expect((await readPlan({ store: s, env: ENV, now: () => t1 })).status).toBe("held");
    expect((await s.get<{ initiatives: unknown[] }>(PLAN_KEYS.data))?.data.initiatives).toHaveLength(3);
    // The operator decides to publish the empty plan.
    await setControl(s, { publishEmpty: true });
    const shown = await readPlan({ store: s, env: ENV, now: () => t1 });
    expect(shown.status === "fresh" && shown.initiatives).toEqual([]);
    // A later non-empty read clears the hold on its own.
    await setControl(s, {});
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t1.getTime() + 60_000), fetchImpl: asana().fetchImpl, log: quiet })).toBe("updated");
    expect((await readPlan({ store: s, env: ENV, now: () => t1 })).status).toBe("fresh");
  });

  it("an all-withheld read counts as empty and is held", async () => {
    const { s } = store();
    const allBad = asana((u) =>
      u.pathname.endsWith("/projects/9001/tasks")
        ? new Response(JSON.stringify({ data: [{ gid: "1", name: "MIRmade synthetic", completed: false }], next_page: null }))
        : u.pathname.endsWith("/tasks/1/subtasks")
          ? new Response('{"data":[],"next_page":null}')
          : null,
    );
    expect(await refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: allBad.fetchImpl, log: quiet })).toBe("held-empty");
  });

  it("withdrawal removes the plan from every surface at once, without a refresh or the provider", async () => {
    const { s } = store();
    await refresh(s);
    await setControl(s, { withdrawn: true });
    expect(await readPlan({ store: s, env: ENV, now: () => t0 })).toEqual({ status: "withdrawn" });
    const a = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 3_600_000), fetchImpl: a.fetchImpl, log: quiet })).toBe("withdrawn");
    expect(a.fetchImpl).not.toHaveBeenCalled();
    // Page, API and Home, with the flag on.
    setSnapshotStoreForTests(s);
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    await expect((await import("@/app/plan/onerhythm/page")).default()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    expect((await (await import("@/app/api/plan/onerhythm/route")).GET()).status).toBe(404);
    const home = renderToStaticMarkup(await (await import("@/app/page")).default());
    expect(home).toContain('data-placeholder="oneRhythmSummary"');
    expect(home).not.toContain("Synthetic initiative");
  });

  it("an unreadable control record shows nothing rather than risk showing a withdrawn plan", async () => {
    const { s } = store();
    await refresh(s);
    const broken: SnapshotStore = { ...s, get: async (k) => (k === PLAN_KEYS.control ? Promise.reject(new Error("synthetic")) : s.get(k)), put: s.put.bind(s), delete: s.delete.bind(s) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await readPlan({ store: broken, env: ENV, now: () => t0 })).status).toBe("unavailable");
  });

  it("missing configuration means unconfigured, never a crash or a request", async () => {
    const { s } = store();
    const a = asana();
    const logs: string[] = [];
    expect(await refreshPlan({ store: s, env: { PLAN_ENABLED: "true" }, now: () => t0, fetchImpl: a.fetchImpl, log: (m) => logs.push(m) })).toBe("unconfigured");
    expect(a.fetchImpl).not.toHaveBeenCalled();
    expect(logs[0]).toMatch(/ASANA_PLAN_PROJECT_ID.*ASANA_PLAN_REFRESH_TOKEN.*PLAN_KEY_SECRET/);
    expect(await refreshPlan({ store: s, env: { ...ENV, ASANA_PLAN_PROJECT_ID: "not-digits" }, now: () => t0, fetchImpl: a.fetchImpl, log: quiet })).toBe("unconfigured");
    expect((await readPlan({ store: s, env: { PLAN_ENABLED: "true" }, now: () => t0 })).status).toBe("unavailable");
  });

  it("with the flag off: no refresh, no read, and the page, API and Home show nothing of the plan", async () => {
    const { s } = store();
    await refresh(s);
    const a = asana();
    expect(await refreshPlan({ store: s, env: { ...ENV, PLAN_ENABLED: "" }, now: () => t0, fetchImpl: a.fetchImpl })).toBe("off");
    expect(a.fetchImpl).not.toHaveBeenCalled();
    expect(await readPlan({ store: s, env: {}, now: () => t0 })).toEqual({ status: "off" });
    for (const v of ["", "TRUE", "1", "yes"]) expect((await readPlan({ store: s, env: { PLAN_ENABLED: v } })).status, v).toBe("off");
    setSnapshotStoreForTests(s);
    vi.stubEnv("PLAN_ENABLED", "");
    await expect((await import("@/app/plan/onerhythm/page")).default()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    const api = await import("@/app/api/plan/onerhythm/route");
    const off = await api.GET();
    expect(off.status).toBe(404);
    expect(off.headers.get("cache-control")).toBe("no-store");
    expect((await api.POST()).status).toBe(404);
    expect((await api.POST()).headers.get("cache-control")).toBe("no-store");
    expect(decide("/plan/onerhythm", {})).toEqual({ action: "deny", reason: "flag", flag: "plan" });
    expect(decide("/api/plan/onerhythm", {})).toEqual({ action: "deny", reason: "flag", flag: "plan" });
    const home = renderToStaticMarkup(await (await import("@/app/page")).default());
    expect(home).toContain('data-placeholder="oneRhythmSummary"');
    expect(home).not.toMatch(/Synthetic initiative|Read the OneRhythm plan/);
  });

  it("with the flag on: the API serves the projection uncached; Home and the page share the snapshot", async () => {
    const { s } = store();
    await refresh(s);
    setSnapshotStoreForTests(s);
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const res = await (await import("@/app/api/plan/onerhythm/route")).GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as PublicPlanState;
    expect(body.status === "fresh" || body.status === "stale").toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/gid|notes|9101/);
    const home = renderToStaticMarkup(await (await import("@/app/page")).default());
    expect(home).toContain("Synthetic initiative one");
    expect(home).toContain("1 done · 2 open");
    expect(home).toContain('href="/plan/onerhythm"');
    expect(home).toContain('data-placeholder="oneRhythmPlanIntro"');
    const page = renderToStaticMarkup(await (await import("@/app/plan/onerhythm/page")).default());
    expect(page).toContain("Synthetic initiative one");
    expect(page).toContain("Last read");
  });
});

describe("rendering (B4)", () => {
  const state = (over: Partial<Extract<PublicPlanState, { readAt: string }>> = {}): PublicPlanState => ({
    status: "fresh",
    readAt: "2026-10-07T12:00:00Z",
    withheld: { initiatives: 0, steps: 0 },
    initiatives: [
      {
        key: "sA",
        title: "Synthetic initiative",
        milestone: false,
        completed: false,
        dueOn: "2026-11-30",
        mentionsSuicide: false,
        steps: [
          { key: "sB", title: "Synthetic done step", milestone: false, completed: true, dueOn: null, mentionsSuicide: false },
          { key: "sC", title: "Synthetic milestone", milestone: true, completed: false, dueOn: "2026-11-02", mentionsSuicide: false },
          { key: "sD", title: "<script>alert(1)</script>", milestone: false, completed: false, dueOn: null, mentionsSuicide: false },
        ],
      },
    ],
    ...over,
  });

  it("states are words; milestones differ by text and weight; titles are escaped", () => {
    const html = renderToStaticMarkup(<PlanBody state={state()} />);
    expect(html).toContain('<time dateTime="2026-10-07T12:00:00Z">7 Oct 2026, 08:00 EDT</time>');
    expect(html).toContain("1 done · 2 open");
    expect(html).toContain('<span class="plan-state">Done</span>');
    expect(html).toContain('<span class="plan-state">Open</span>');
    expect(html).toContain('<strong class="plan-milestone"><span class="plan-milestone-label">Milestone:</span> Synthetic milestone</strong>');
    expect(html).toContain('Due <time dateTime="2026-11-02">2 Nov 2026</time>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/asana|percent|%/i);
  });

  it("stale, unavailable and held are labeled in server-rendered HTML", () => {
    expect(renderToStaticMarkup(<PlanBody state={state({ status: "stale" } as never)} />)).toMatch(/data-plan-status="stale".*more than 30 minutes old/);
    expect(renderToStaticMarkup(<PlanBody state={{ status: "unavailable" }} />)).toContain("OneRhythm plan unavailable.");
    expect(renderToStaticMarkup(<PlanBody state={{ status: "held" }} />)).toContain("held for review and not shown");
    expect(renderToStaticMarkup(<PlanBody state={state({ initiatives: [] })} />)).toContain("No steps are listed.");
  });

  it("says when items are held back, so a partial plan is not presented as complete", () => {
    expect(renderToStaticMarkup(<PlanBody state={state({ withheld: { initiatives: 1, steps: 2 } })} />)).toContain("3 items are held for review and not shown.");
    expect(renderToStaticMarkup(<PlanBody state={state()} />)).not.toContain("held for review");
  });

  it("a title that mentions suicide carries the crisis block on the page and on Home", () => {
    const s = state();
    if (s.status !== "fresh") throw new Error("fixture");
    const withMention = { ...s, initiatives: [{ ...s.initiatives[0]!, title: "Synthetic suicide prevention resources", mentionsSuicide: true }] };
    expect(renderToStaticMarkup(<PlanBody state={withMention} />)).toContain(CRISIS_SUPPORT_TEXT);
    expect(renderToStaticMarkup(<PlanSummary state={withMention} />)).toContain(CRISIS_SUPPORT_TEXT);
    expect(renderToStaticMarkup(<PlanBody state={s} />)).not.toContain(CRISIS_SUPPORT_TEXT);
  });

  it("links nowhere but the site (A-10)", () => {
    const hrefs = [...renderToStaticMarkup(<><PlanBody state={state()} /><PlanSummary state={state()} /></>).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/plan/onerhythm"]);
  });
});

describe("polling (A-4)", () => {
  function fakeDoc(visible = true) {
    const listeners = new Set<() => void>();
    return {
      visibilityState: (visible ? "visible" : "hidden") as DocumentVisibilityState,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      set(v: DocumentVisibilityState) {
        this.visibilityState = v;
        listeners.forEach((fn) => fn());
      },
      listeners,
    };
  }
  beforeEach(() => vi.useFakeTimers({ now: t0 }));
  afterEach(() => vi.useRealTimers());

  it("polls every 60 seconds while visible, stops while hidden, catches up when shown", async () => {
    const doc = fakeDoc();
    const fetchOnce = vi.fn(async () => {});
    const stop = startPlanPolling({ doc: doc as never, fetchOnce });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchOnce).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    doc.set("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    doc.set("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    expect(doc.listeners.size).toBe(0);
  });

  it("does not start while hidden, and a failed poll does not stop polling", async () => {
    const doc = fakeDoc(false);
    let n = 0;
    const fetchOnce = vi.fn(async () => {
      if (++n === 1) throw new Error("synthetic");
    });
    const stop = startPlanPolling({ doc: doc as never, fetchOnce });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchOnce).not.toHaveBeenCalled();
    doc.set("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe("cron job (B3)", () => {
  it("runs the plan job and reports it separately", async () => {
    const { s } = store();
    setSnapshotStoreForTests(s);
    vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
    vi.stubEnv("UPSTREAM_REFRESH", "");
    vi.stubEnv("PLAN_ENABLED", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<rss/>")));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GET } = await import("@/app/api/cron/refresh/route");
    const res = await GET(new Request("http://localhost/api/cron/refresh", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).jobs.plan).toEqual({ status: "ok", detail: { result: "off" } });
    vi.stubEnv("PLAN_ENABLED", "true");
    const res2 = await GET(new Request("http://localhost/api/cron/refresh", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
    expect(res2.status).toBe(200);
    expect((await res2.json()).jobs.plan).toEqual({ status: "error", detail: { result: "unconfigured" } });
    vi.unstubAllGlobals();
  });
});

it("isShown hides off and withdrawn", () => {
  expect(isShown({ status: "off" })).toBe(false);
  expect(isShown({ status: "withdrawn" })).toBe(false);
  expect(isShown({ status: "held" })).toBe(true);
});

describe("stable keys across reads (A-5)", () => {
  const SECRET = ENV.PLAN_KEY_SECRET;
  const allKeys = (p: { initiatives: { key: string; steps: { key: string }[] }[] }) => p.initiatives.flatMap((i) => [i.key, ...i.steps.map((s) => s.key)]);

  it("keeps every key ever issued, so an item held back or missing from a read gets its old key when it returns", () => {
    const first = keyAllocator(null, SECRET, { now: t0 });
    const a = first.keyFor("9101");
    const b = first.keyFor("9201");
    // The second read does not include 9201 (held back, or briefly missing).
    const second = keyAllocator(first.index(), SECRET, { now: new Date(t0.getTime() + 60_000) });
    expect(second.keyFor("9101")).toBe(a);
    const kept = second.index();
    expect(Object.keys(kept.entries)).toContain(keyIndexDigest("9201", SECRET));
    // It returns in the third read with the same key.
    const third = keyAllocator(kept, SECRET, { now: new Date(t0.getTime() + 120_000) });
    expect(third.keyFor("9201")).toBe(b);
    expect(third.keyFor("9101")).toBe(a);
  });

  it("through refresh: a step left out of one read keeps its key in the next", async () => {
    const { s } = store();
    const read = (at: number, over?: (u: URL) => Response | null) =>
      refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + at), fetchImpl: asana(over).fetchImpl, log: quiet });
    expect(await read(0)).toBe("updated");
    const before = allKeys((await s.get<{ initiatives: PlanInitiative[] }>(PLAN_KEYS.data))!.data);
    // Initiative 9102's steps are missing from the next read.
    expect(await read(60_000, (u) => (u.pathname.endsWith("/tasks/9102/subtasks") ? new Response('{"data":[],"next_page":null}') : null))).toBe("updated");
    const during = allKeys((await s.get<{ initiatives: PlanInitiative[] }>(PLAN_KEYS.data))!.data);
    expect(during.length).toBeLessThan(before.length);
    expect(await read(120_000)).toBe("updated");
    expect(allKeys((await s.get<{ initiatives: PlanInitiative[] }>(PLAN_KEYS.data))!.data)).toEqual(before);
  });

  it("bounds the index: every item in the current read, then the most recently seen others, up to the limit", () => {
    expect(MAX_KEY_INDEX_ENTRIES).toBe(5_000);
    let n = 0;
    const make = () => `s${String(++n).padStart(12, "0")}`;
    let idx: KeyIndex | null = null;
    // Five reads, one item each, a minute apart: items 1..5, oldest first.
    for (let i = 1; i <= 5; i++) {
      const k = keyAllocator(idx, SECRET, { now: new Date(t0.getTime() + i * 60_000), make, max: 3 });
      k.keyFor(String(i));
      idx = k.index();
    }
    const digests = (ids: string[]) => ids.map((id) => keyIndexDigest(id, SECRET)).sort();
    expect(Object.keys(idx!.entries).sort()).toEqual(digests(["3", "4", "5"]));
    // A read larger than the limit keeps all of its own items.
    const big = keyAllocator(idx, SECRET, { now: new Date(t0.getTime() + 10 * 60_000), make, max: 3 });
    for (const id of ["10", "11", "12", "13"]) big.keyFor(id);
    expect(Object.keys(big.index().entries).sort()).toEqual(digests(["10", "11", "12", "13"]));
  });

  it("never reuses a key that is in the index, even for an item not in this read", () => {
    const first = keyAllocator(null, SECRET, { now: t0, make: () => "sAAAAAAAAAAAA" });
    first.keyFor("1");
    const keys = ["sAAAAAAAAAAAA", "sBBBBBBBBBBBB"];
    const second = keyAllocator(first.index(), SECRET, { now: t0, make: () => keys.shift() as string });
    expect(second.keyFor("2")).toBe("sBBBBBBBBBBBB");
  });

  it("rotating PLAN_KEY_SECRET re-keys every item and drops the old entries", async () => {
    const { s } = store();
    const logs: string[] = [];
    const read = (env: typeof ENV, at: number) =>
      refreshPlan({ store: s, env, now: () => new Date(t0.getTime() + at), fetchImpl: asana().fetchImpl, log: (m) => logs.push(m) });
    await read(ENV, 0);
    const before = allKeys((await s.get<{ initiatives: PlanInitiative[] }>(PLAN_KEYS.data))!.data);
    const rotated = { ...ENV, PLAN_KEY_SECRET: "a-different-synthetic-secret-of-32-characters" };
    expect(await read(rotated, 60_000)).toBe("updated");
    const after = allKeys((await s.get<{ initiatives: PlanInitiative[] }>(PLAN_KEYS.data))!.data);
    expect(after).toHaveLength(before.length);
    for (const k of after) expect(before).not.toContain(k);
    expect(logs.join("\n")).toMatch(/PLAN_KEY_SECRET changed; every item gets a new public key/);
    expect(logs.join("\n")).not.toContain(rotated.PLAN_KEY_SECRET);
    const idx = (await s.get<KeyIndex>(PLAN_KEYS.index))!.data;
    expect(Object.keys(idx.entries)).toHaveLength(after.length);
  });

  it("treats an index in any other shape as unreadable and starts afresh", () => {
    const k = keyAllocator({ [keyIndexDigest("1", SECRET)]: "sAAAAAAAAAAAA" }, SECRET, { now: t0 });
    expect(k.priorState).toBe("unreadable");
    expect(k.keyFor("1")).not.toBe("sAAAAAAAAAAAA");
    expect(keyAllocator(null, SECRET, { now: t0 }).priorState).toBe("empty");
  });
});

describe("client staleness (A-3, A-8)", () => {
  const shown = (status: "fresh" | "stale", readAt = t0.toISOString()): PublicPlanState => ({ status, readAt, initiatives: [], withheld: { initiatives: 0, steps: 0 } });

  it("turns fresh into stale after 30 minutes, from the read time alone", () => {
    expect(restale(shown("fresh"), t0.getTime() + PLAN_STALE_AFTER_MS).status).toBe("fresh");
    expect(restale(shown("fresh"), t0.getTime() + PLAN_STALE_AFTER_MS + 1).status).toBe("stale");
  });

  it("never turns a stale read fresh, and leaves held and unavailable alone", () => {
    expect(restale(shown("stale"), t0.getTime()).status).toBe("stale");
    expect(restale({ status: "held" }, t0.getTime() + 10 * PLAN_STALE_AFTER_MS)).toEqual({ status: "held" });
    expect(restale({ status: "unavailable" }, t0.getTime() + 10 * PLAN_STALE_AFTER_MS)).toEqual({ status: "unavailable" });
  });

  it("a poll ages the shown read when the request throws, errors or is not JSON; a 404 leaves the page", async () => {
    const later = () => t0.getTime() + 31 * 60_000;
    const gone = vi.fn();
    for (const fetchImpl of [
      async () => Promise.reject(new Error("synthetic")),
      async () => new Response("{}", { status: 500 }),
      async () => new Response("not json", { status: 200 }),
    ]) {
      const update = await pollPlanOnce("/api/plan/onerhythm", { fetchImpl, now: later, gone });
      expect(update(shown("fresh")).status).toBe("stale");
    }
    expect(gone).not.toHaveBeenCalled();
    const update = await pollPlanOnce("/api/plan/onerhythm", { fetchImpl: async () => new Response(null, { status: 404 }), now: later, gone });
    expect(gone).toHaveBeenCalledTimes(1);
    expect(update(shown("fresh")).status).toBe("fresh");
  });

  it("a poll that works shows the new read, aged by the same rule", async () => {
    const next = shown("fresh", new Date(t0.getTime() + 60_000).toISOString());
    const update = await pollPlanOnce("/api/plan/onerhythm", { fetchImpl: async () => Response.json(next), now: () => t0.getTime() + 2 * 60_000, gone: () => {} });
    expect(update(shown("fresh"))).toEqual(next);
  });

  describe("a tab whose polls keep failing", () => {
    beforeEach(() => vi.useFakeTimers({ now: t0 }));
    afterEach(() => vi.useRealTimers());

    it("shows stale once the last read is more than 30 minutes old", async () => {
      let state = shown("fresh");
      const doc = { visibilityState: "visible" as DocumentVisibilityState, addEventListener: () => {}, removeEventListener: () => {} };
      const failing = vi.fn(async () => Promise.reject(new Error("synthetic")));
      const stop = startPlanPolling({
        doc,
        // As PlanLive does it.
        fetchOnce: async () => {
          const update = await pollPlanOnce("/api/plan/onerhythm", { fetchImpl: failing, now: () => Date.now(), gone: () => {} });
          state = update(state);
        },
      });
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(failing).toHaveBeenCalledTimes(30);
      expect(state.status).toBe("fresh");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(state.status).toBe("stale");
      stop();
    });
  });
});

describe("client nits (A-4)", () => {
  it("drops the cached access token when the API answers 401, so the next read gets a new one", async () => {
    const { s } = store();
    const tokenCalls = (a: ReturnType<typeof asana>) => a.calls.filter((c) => c.url === TOKEN_URL).length;
    const ok = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: ok.fetchImpl, log: quiet })).toBe("updated");
    expect(tokenCalls(ok)).toBe(1);
    // Within the token's hour, a second read reuses it.
    const reuse = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 60_000), fetchImpl: reuse.fetchImpl, log: quiet })).toBe("updated");
    expect(tokenCalls(reuse)).toBe(0);
    // The API refuses the token.
    const refused = asana((u) => (u.pathname.endsWith("/projects/9001/tasks") ? new Response("{}", { status: 401 }) : null));
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 120_000), fetchImpl: refused.fetchImpl, log: quiet })).toBe("failed");
    expect(tokenCalls(refused)).toBe(0);
    // The next read, after the backoff, exchanges the refresh token again.
    const again = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 300_000), fetchImpl: again.fetchImpl, log: quiet })).toBe("updated");
    expect(tokenCalls(again)).toBe(1);
  });

  it("keeps the cached token on other failures", async () => {
    const { s } = store();
    await refreshPlan({ store: s, env: ENV, now: () => t0, fetchImpl: asana().fetchImpl, log: quiet });
    const failing = asana((u) => (u.pathname.endsWith("/projects/9001/tasks") ? new Response("{}", { status: 503 }) : null));
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 60_000), fetchImpl: failing.fetchImpl, log: quiet })).toBe("failed");
    const again = asana();
    expect(await refreshPlan({ store: s, env: ENV, now: () => new Date(t0.getTime() + 300_000), fetchImpl: again.fetchImpl, log: quiet })).toBe("updated");
    expect(again.calls.filter((c) => c.url === TOKEN_URL)).toHaveLength(0);
  });

  it("stops sibling subtask requests once one fails, and aborts those in flight", async () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({ gid: String(9300 + i), name: `Synthetic initiative ${i}`, completed: false }));
    const started: string[] = [];
    const aborted: string[] = [];
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      const u = new URL(input);
      if (u.pathname.endsWith("/projects/9001/tasks")) return Response.json({ data: tasks, next_page: null });
      const gid = /\/tasks\/(\d+)\/subtasks$/.exec(u.pathname)?.[1] as string;
      started.push(gid);
      if (gid === "9300") {
        await new Promise((r) => setTimeout(r, 5));
        return new Response("{}", { status: 500 });
      }
      // The others wait until they are aborted.
      return new Promise<Response>((_, reject) =>
        init.signal?.addEventListener("abort", () => {
          aborted.push(gid);
          reject(new Error("aborted"));
        }),
      );
    });
    await expect(readPlanSource("9001", { token: "t", fetchImpl })).rejects.toThrow("subtasks: HTTP 500");
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toHaveLength(4);
    expect(aborted.sort()).toEqual(["9301", "9302", "9303"]);
  });
});
