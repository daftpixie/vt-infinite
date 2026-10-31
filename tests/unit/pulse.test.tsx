import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SitePulse } from "@/components/pulse/SitePulse";
import { PrivacyNotice } from "@/components/landing/PrivacyNotice";
import { AnalyticsNotice } from "@/components/pulse/AnalyticsNotice";
import { decide } from "@/lib/access";
import { collectionEnabled, collectionRequested, scriptSource, statsCredentials } from "@/lib/pulse/config";
import { plausibleBootstrap } from "@/lib/pulse/collection";
import { readHistory, readRecent, STATS_URL, StatsUnavailable, type FetchImpl } from "@/lib/pulse/client";
import { createPulseService } from "@/lib/pulse/service";
import { aggregatePaths, publicMeasurementPaths } from "@/lib/pulse/public-paths";
import { HISTORY_FRESH_MS, RECENT_FRESH_MS, restalePulse, tracePoints } from "@/lib/pulse/model";
import type { PulseStore } from "@/lib/pulse/store";
import { plausibleCspSources, securityHeaders } from "@/lib/security-headers";
import { privacyNoticeVersion } from "@/lib/privacy";
import { validHistory, validRecent } from "@/lib/pulse/validation";
import { syntheticPulse } from "../pulse-synthetic";

const credentials = { siteId: "synthetic.example", apiKey: "synthetic-stats-credential" };
const enabled = { PUBLIC_PULSE_ENABLED: "true", PLAUSIBLE_SITE_ID: credentials.siteId, PLAUSIBLE_API_KEY: credentials.apiKey };
const paths = ["/", "/privacy"];
const production = { PLAUSIBLE_ENABLED: "true", VERCEL_ENV: "production", NODE_ENV: "production", PLAUSIBLE_SCRIPT_SRC: "https://plausible.io/js/pa-syntheticInstallOnly.js" } as const;
const end = Date.UTC(2026, 10, 1, 9, 30); // A synthetic DST-transition fixture.

function transport(value = 2) {
  return vi.fn<FetchImpl>(async (url, init) => {
    expect(url).toBe(STATS_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    const body = JSON.parse(String(init.body));
    expect(body.metrics).toEqual(["pageviews"]);
    return Response.json({ results: body.dimensions.length ? [] : value ? [{ dimensions: [], metrics: [value] }] : [], meta: body.dimensions.length ? { total_rows: 0 } : {} });
  });
}

function memoryStore() {
  const values = new Map<string, unknown>();
  const leases = new Map<string, { owner: string; until: number }>();
  const store: PulseStore = {
    load: vi.fn(async (key) => structuredClone(values.get(key) ?? null)),
    save: vi.fn(async (key, value) => { values.set(key, structuredClone(value)); }),
    claim: vi.fn(async (key, owner, now, until) => {
      if ((leases.get(key)?.until ?? 0) > now) return false;
      leases.set(key, { owner, until }); return true;
    }),
    defer: vi.fn(async (key, owner, until) => { if (leases.get(key)?.owner === owner) leases.set(key, { owner, until }); }),
  };
  return { store, values, leases };
}

afterEach(() => vi.unstubAllEnvs());

describe("publication, collection and credential boundaries", () => {
  it("requires exact production collection configuration and keeps the provider hold closed", () => {
    expect(collectionRequested(production)).toBe(true);
    expect(collectionEnabled(production)).toBe(false);
    for (const env of [{}, { ...production, PLAUSIBLE_ENABLED: "TRUE" }, { ...production, VERCEL_ENV: "preview" }, { ...production, NODE_ENV: "development" }, { ...production, NODE_ENV: "test" }, { ...production, CI: "true" }, { ...production, PLAYWRIGHT_TEST: "1" }]) expect(collectionRequested(env)).toBe(false);
    expect(scriptSource(production)).toBe(production.PLAUSIBLE_SCRIPT_SRC);
    for (const src of ["https://plausible.io/js/script.js", "https://evil.example/js/pa-syntheticInstallOnly.js", `${production.PLAUSIBLE_SCRIPT_SRC}?x=1`, `${production.PLAUSIBLE_SCRIPT_SRC}#x`, "https://plausible.io.evil.example/js/pa-syntheticInstallOnly.js", "https://a:b@plausible.io/js/pa-syntheticInstallOnly.js"]) expect(scriptSource({ PLAUSIBLE_SCRIPT_SRC: src })).toBeNull();
    expect(statsCredentials({})).toBeNull();
  });

  it("fails the production build clearly when collection is requested before the provider fix", () => {
    const r = spawnSync(process.execPath, ["scripts/check-release.mjs"], { encoding: "utf8", env: { ...process.env, SITE_MODE: "full", PLAN_ENABLED: "", NOW_PLAYING_ENABLED: "", ...production } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the supplied script sends engagement outside transformRequest");
  });

  it("flag off makes no store reads, no fetches and publishes no old snapshot", async () => {
    const { store } = memoryStore();
    const fetchImpl = transport();
    const service = createPulseService({ store, fetchImpl, paths });
    expect(await service.read({})).toBeNull();
    expect(await service.read({ ...enabled, PUBLIC_PULSE_ENABLED: "TRUE" })).toBeNull();
    expect(store.load).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("missing credentials and unavailable durable leases render unavailable without a provider call", async () => {
    const { store } = memoryStore();
    const fetchImpl = transport();
    const service = createPulseService({ store, fetchImpl, paths });
    expect((await service.read({ PUBLIC_PULSE_ENABLED: "true" }))?.status).toBe("unavailable");
    store.claim = async () => { throw new Error("store unavailable"); };
    expect((await service.read(enabled))?.status).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows only registered public pages; the landing gate opens only the pulse API", () => {
    const publicPaths = publicMeasurementPaths({ SITE_MODE: "landing" });
    expect(publicPaths).toEqual(paths);
    const all = aggregatePaths({});
    expect(all).not.toContain("/admin");
    expect(all.some((p) => p.startsWith("/api/") || p.startsWith("/governance/demo"))).toBe(false);
    const landing = { SITE_MODE: "landing", PUBLIC_PULSE_ENABLED: "true" };
    expect(decide("/api/pulse", landing)).toEqual({ action: "pass" });
    for (const path of ["/words", "/admin", "/api/pulse/x", "/api/plan/onerhythm"]) expect(decide(path, landing).action).toBe("deny");
  });

  it("CSP adds only a validated script path and collection endpoint; the hold leaves policies unchanged", () => {
    expect(plausibleCspSources(production.PLAUSIBLE_SCRIPT_SRC)).toEqual({ script: ` ${production.PLAUSIBLE_SCRIPT_SRC}`, connect: " https://plausible.io/api/event" });
    expect(plausibleCspSources("https://evil.example/script.js")).toEqual({ script: "", connect: "" });
    const headers = securityHeaders(false, production);
    const csp = headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).not.toContain("plausible.io");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/unsafe-eval|\*/);
  });
});

describe("fixed Stats API v2 aggregates", () => {
  it("calculates five-minute BPM, adjacent exact hourly windows and DST-safe totals", async () => {
    const fetchImpl = transport(7);
    const recent = await readRecent(credentials, paths, end, fetchImpl);
    expect(recent.bpm).toBe(1.4);
    expect(Date.parse(recent.end) - Date.parse(recent.start)).toBe(300_000);
    const history = await readHistory(credentials, paths, end, fetchImpl);
    expect(history.total).toBe(168);
    expect(history.peak).toBe(7);
    expect(history.buckets).toHaveLength(24);
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies).toHaveLength(26);
    for (const body of bodies) {
      expect(body.site_id).toBe(credentials.siteId);
      expect(body.filters).toEqual([["is", "event:page", paths]]);
      expect(body.dimensions).not.toContain("visit:referrer");
      expect(body.include.imports).toBe(false);
    }
    for (let i = 1; i < 24; i++) expect(history.buckets[i]!.start).toBe(history.buckets[i - 1]!.end);
    expect(Date.parse(history.end) - Date.parse(history.start)).toBe(86_400_000);
  });

  it("successful empty results are real zeros", async () => {
    const t = transport(0);
    expect((await readRecent(credentials, paths, end, t)).pageviews).toBe(0);
    const history = await readHistory(credentials, paths, end, t);
    expect([history.total, history.peak]).toEqual([0, 0]);
    expect(history.sources).toEqual([]);
  });

  it.each([401, 402, 403, 429, 500])("status %s never turns into zero or discloses upstream details", async (status) => {
    const t: FetchImpl = async () => new Response("private upstream details", { status, headers: { "retry-after": "900" } });
    await expect(readRecent(credentials, paths, end, t)).rejects.toThrow("Aggregate read unavailable");
  });

  it.each([{ bad: true }, { results: [{ dimensions: [], metrics: [-1] }] }, { results: [{ dimensions: [], metrics: [null] }] }])("rejects malformed successful responses: %j", async (body) => {
    await expect(readRecent(credentials, paths, end, async () => Response.json(body))).rejects.toBeInstanceOf(StatsUnavailable);
  });

  it("withholds identifying and low-count sources and refuses a truncated breakdown", async () => {
    const t: FetchImpl = async (_url, init) => {
      const source = JSON.parse(String(init.body)).dimensions.length > 0;
      return Response.json({ results: source ? [
        { dimensions: ["Google"], metrics: [5] }, { dimensions: ["private-campaign-person@example.test"], metrics: [8] }, { dimensions: ["Discord"], metrics: [2] },
      ] : [{ dimensions: [], metrics: [1] }], meta: source ? { total_rows: 3 } : {} });
    };
    const h = await readHistory(credentials, paths, end, t);
    expect(h.sources).toEqual([{ label: "Other sources", pageviews: 10 }, { label: "Google", pageviews: 5 }]);
    expect(JSON.stringify(h)).not.toMatch(/private-campaign|@example|Discord/);
    await expect(readHistory(credentials, paths, end, async (_url, init) => Response.json({ results: [], meta: JSON.parse(String(init.body)).dimensions.length ? { total_rows: 10 } : {} }))).rejects.toBeInstanceOf(StatsUnavailable);
  });
});

describe("shared snapshots, coalescing and failures", () => {
  it("reuses durable snapshots across cold instances and refreshes only the due tier", async () => {
    const { store } = memoryStore();
    const t = transport();
    let now = end;
    const deps = { store, fetchImpl: t, env: enabled, paths, now: () => now };
    const a = createPulseService(deps);
    const results = await Promise.all(Array.from({ length: 40 }, () => a.read()));
    expect(results.every((r) => r?.status === "fresh")).toBe(true);
    expect(t).toHaveBeenCalledTimes(26);
    const b = createPulseService(deps);
    expect((await b.read())?.status).toBe("fresh");
    expect(t).toHaveBeenCalledTimes(26);
    now += RECENT_FRESH_MS;
    await b.read();
    expect(t).toHaveBeenCalledTimes(27);
    now = end + HISTORY_FRESH_MS;
    await Promise.all([a.read(), b.read()]);
    expect(t).toHaveBeenCalledTimes(53);
    expect((await a.read({ ...enabled, PUBLIC_PULSE_ENABLED: "false" }))).toBeNull();
    expect(t).toHaveBeenCalledTimes(53);
  });

  it("preserves the last successful timestamps on failure and honours shared Retry-After", async () => {
    const { store } = memoryStore();
    let now = end;
    let fail = false;
    const good = transport();
    const t = vi.fn<FetchImpl>((url, init) => fail ? Promise.resolve(new Response("never expose", { status: 429, headers: { "retry-after": "900" } })) : good(url, init));
    const deps = { store, fetchImpl: t, env: enabled, paths, now: () => now };
    const service = createPulseService(deps);
    const first = await service.read();
    fail = true; now += HISTORY_FRESH_MS;
    const stale = await service.read();
    expect(stale?.status).toBe("stale");
    expect(stale?.history.data).toEqual(first?.history.data);
    expect(stale?.recent.data?.readAt).toBe(first?.recent.data?.readAt);
    const calls = t.mock.calls.length;
    now += 60_000;
    await createPulseService(deps).read();
    expect(t).toHaveBeenCalledTimes(calls);
    expect(JSON.stringify(stale)).not.toContain(credentials.apiKey);
    expect(JSON.stringify(stale)).not.toContain("never expose");
  });

  it("never publishes malformed cached aggregates or extra fields", async () => {
    const { store } = memoryStore();
    store.load = async () => ({ ...syntheticPulse(end).history.data, privateField: credentials.apiKey });
    const r = await createPulseService({ store, env: { PUBLIC_PULSE_ENABLED: "true" }, paths }).read();
    expect(r?.status).toBe("unavailable");
    expect(JSON.stringify(r)).not.toContain(credentials.apiKey);
    const h = syntheticPulse(end).history.data!;
    expect(validHistory({ ...h, total: h.total + 1 })).toBeNull();
    expect(validRecent({ ...syntheticPulse(end).recent.data, bpm: 7 })).toBeNull();
  });
});

describe("bootstrap and automatic navigation contract (mocked transport only)", () => {
  it("preserves queue/init, disables optional capture, strips identifiers and filters private paths", () => {
    const win: Record<string, unknown> = {};
    vm.runInNewContext(plausibleBootstrap(paths), { window: win, URL, location: { origin: "https://synthetic.example" } });
    const plausible = win.plausible as ((...args: unknown[]) => void) & { q: unknown[]; o: { transformRequest: (p: unknown) => unknown; outboundLinks: boolean; fileDownloads: boolean; formSubmissions: boolean; autoCapturePageviews: boolean; captureOnLocalhost: boolean } };
    plausible("queued-test");
    expect(plausible.q).toHaveLength(1);
    expect(plausible.o).toMatchObject({ outboundLinks: false, fileDownloads: false, formSubmissions: false, captureOnLocalhost: false, autoCapturePageviews: true });
    const transform = plausible.o.transformRequest;
    expect(transform({ n: "pageview", u: "https://synthetic.example/?utm_campaign=identifying#private", r: "https://ref.example/person?q=private", d: "synthetic.example", v: 37, p: { personal: "no" } })).toEqual({ n: "pageview", u: "https://synthetic.example/", r: "https://ref.example", d: "synthetic.example", v: 37 });
    expect(transform({ n: "engagement", u: "https://synthetic.example/" })).toBeNull();
    for (const path of ["/admin", "/api/pulse", "/unknown", "/governance/demo"]) expect(transform({ n: "pageview", u: `https://synthetic.example${path}` })).toBeNull();
    const emitted: unknown[] = [];
    let previous = "";
    const automaticPage = (path: string) => { if (previous === path) return; previous = path; const p = transform({ n: "pageview", u: `https://synthetic.example${path}` }); if (p) emitted.push(p); };
    automaticPage("/"); automaticPage("/"); automaticPage("/privacy"); automaticPage("/admin"); automaticPage("/");
    expect(emitted).toHaveLength(3);
  });
});

describe("static, accessible display and notices", () => {
  it.each(["compact", "expanded"] as const)("%s contains actual counts, windows, table, definitions and no autoplay", (variant) => {
    const r = syntheticPulse(end);
    const html = renderToStaticMarkup(<SitePulse initial={r} variant={variant} />);
    expect(html).toContain("five-minute average");
    expect(html).toContain("EKG-inspired traffic trace");
    expect(html).toContain("1-hour buckets");
    expect(html).toContain("America/New_York");
    expect(html).toContain("<table");
    expect(html).toContain('data-sweeping="false"');
    expect(html).toContain("<noscript>");
    expect(html).not.toContain("aria-live");
    expect(html.includes("<h3>Circulation</h3>")).toBe(variant === "expanded");
    expect(tracePoints(r.history.data!.buckets).split(" ")).toHaveLength(24);
    const stale = restalePulse(r, end + HISTORY_FRESH_MS);
    expect([stale.recent.status, stale.history.status]).toEqual(["stale", "stale"]);
    expect(stale.history.data?.readAt).toBe(r.history.data?.readAt);
  });

  it("versions the actual disabled-collection/published-aggregate combination and retains historical notices", () => {
    expect(privacyNoticeVersion({})).toBe("landing-signal-1");
    expect(privacyNoticeVersion({ NOW_PLAYING_ENABLED: "true" })).toBe("landing-signal-2");
    expect(privacyNoticeVersion({ PUBLIC_PULSE_ENABLED: "true" })).toBe("landing-signal-5");
    const html = renderToStaticMarkup(<PrivacyNotice version="landing-signal-5" />);
    expect(html).toContain("Collection of pageviews by Plausible is off");
    expect(html).toContain("The Signal publishes selected aggregate");
    expect(renderToStaticMarkup(<PrivacyNotice version="landing-1" />)).toContain("It uses no analytics");
    const collected = renderToStaticMarkup(<AnalyticsNotice collection publication />);
    expect(collected).toContain("daily identifier specific to this site and device");
    expect(collected).toContain("It keeps event and session records");
  });
});
