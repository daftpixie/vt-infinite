import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NowPlayingBody } from "@/components/now-playing/NowPlayingBody";
import { CRISIS_SUPPORT_TEXT } from "@/lib/crisis";
import {
  ALLOWED,
  assertAllowed,
  CLIENT_TIMEOUT_MS,
  CURRENTLY_PLAYING_URL,
  DisallowedRequest,
  MAX_RESPONSE_BYTES,
  readCurrentlyPlaying,
  refreshAccessToken,
  retryAfterSeconds,
  SCOPE,
  TOKEN_URL,
} from "@/lib/now-playing/client";
import { estimatedExpiry, expiryWarning, nowPlayingEnabled, parseAuthorizedAt, readCredentials, sharingOn } from "@/lib/now-playing/config";
import { project, type NowPlayingView } from "@/lib/now-playing/projection";
import { createNowPlayingService, KEYS, SHARED_TTL_MS, type SharedCache } from "@/lib/now-playing/service";
import { ageText, labelText, NOW_PLAYING_LABEL, STATE_TEXT } from "@/lib/now-playing/view";
import { ALBUM_URL, ARTIST_URL, episodeBody, TOKEN_OK, TRACK_URL, trackBody } from "./now-playing-synthetic";

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

/** Synthetic credentials; not real values. */
const CREDS_ENV = {
  SPOTIFY_CLIENT_ID: "synthetic-client-id",
  SPOTIFY_CLIENT_SECRET: "synthetic-client-secret",
  SPOTIFY_REFRESH_TOKEN: "synthetic-refresh-token",
  SPOTIFY_AUTHORIZED_AT: "2026-10-24",
};
/** Fischer's settle wait, shortened for the tests; far longer than any fake cache operation. */
const SETTLE = 20;
const SECRETS = [CREDS_ENV.SPOTIFY_CLIENT_SECRET, CREDS_ENV.SPOTIFY_REFRESH_TOKEN, TOKEN_OK.access_token, "synthetic-new-refresh-token"];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// A stand-in for Vercel's Runtime Cache, shared by several "instances". Each
// operation yields a random number of turns first, so operations from
// different instances interleave the way network calls do.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

class FakeCache implements SharedCache {
  readonly data = new Map<string, { value: unknown; expires: number }>();
  gets = 0;
  constructor(
    private readonly clock: () => number,
    private readonly random: () => number = () => 0,
  ) {}
  private async yieldTurns() {
    for (let i = Math.floor(this.random() * 4); i > 0; i--) await new Promise((r) => setImmediate(r));
  }
  async get(key: string) {
    this.gets++;
    await this.yieldTurns();
    const e = this.data.get(key);
    return e && e.expires > this.clock() ? structuredClone(e.value) : null;
  }
  async set(key: string, value: unknown, { ttl }: { ttl: number }) {
    await this.yieldTurns();
    this.data.set(key, { value: structuredClone(value), expires: this.clock() + ttl * 1000 });
  }
}

type Answer = { status: number; body?: unknown; headers?: Record<string, string> };

/** A synthetic Spotify. Records every request; answers from the handlers. */
function fakeSpotify(handlers: { token?: () => Answer; read?: () => Answer } = {}) {
  const calls: Array<{ url: string; method: string; body: string; headers: Record<string, string>; redirect?: RequestRedirect }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", body: String(init.body ?? ""), headers: { ...(init.headers as Record<string, string>) }, redirect: init.redirect });
    const a: Answer = url === TOKEN_URL ? (handlers.token ?? (() => ({ status: 200, body: TOKEN_OK })))() : (handlers.read ?? (() => ({ status: 200, body: trackBody() })))();
    const body = a.body === undefined ? null : JSON.stringify(a.body);
    return new Response(a.status === 204 ? null : body, { status: a.status, headers: { "Content-Type": "application/json", ...a.headers } });
  };
  return { calls, fetchImpl, reads: () => calls.filter((c) => c.url === CURRENTLY_PLAYING_URL).length, tokens: () => calls.filter((c) => c.url === TOKEN_URL).length };
}

function setup(opts: { env?: Record<string, string>; handlers?: Parameters<typeof fakeSpotify>[0]; instances?: number; seed?: number } = {}) {
  let t = Date.UTC(2026, 9, 24, 12);
  const clock = { now: () => t, advance: (ms: number) => void (t += ms) };
  const cache = new FakeCache(clock.now, opts.seed === undefined ? undefined : rng(opts.seed));
  const spotify = fakeSpotify(opts.handlers);
  const logs: string[] = [];
  const env = { ...CREDS_ENV, ...opts.env };
  const services = Array.from({ length: opts.instances ?? 1 }, () =>
    createNowPlayingService({ cache, fetchImpl: spotify.fetchImpl, env, now: clock.now, log: (m) => logs.push(m), settleMs: SETTLE }),
  );
  return { clock, cache, spotify, logs, services, svc: services[0]!, env };
}

// ---------------------------------------------------------------------------

describe("flags and configuration (N1, N3)", () => {
  it("is off unless NOW_PLAYING_ENABLED is exactly true", () => {
    for (const v of [undefined, "", "TRUE", "1", "yes", "on", " true"]) expect(nowPlayingEnabled({ NOW_PLAYING_ENABLED: v })).toBe(false);
    expect(nowPlayingEnabled({ NOW_PLAYING_ENABLED: "true" })).toBe(true);
  });

  it("shares when NOW_PLAYING_SHARING is unset (L3); off, or any other value, pauses", () => {
    expect(sharingOn({})).toBe(true);
    expect(sharingOn({ NOW_PLAYING_SHARING: "" })).toBe(true);
    expect(sharingOn({ NOW_PLAYING_SHARING: "on" })).toBe(true);
    for (const v of ["off", "OFF", "false", "paused", "no", "0", "of"]) expect(sharingOn({ NOW_PLAYING_SHARING: v }), v).toBe(false);
  });

  it("reads credentials in Production only on Vercel, and never with one missing", () => {
    expect(readCredentials(CREDS_ENV)?.clientId).toBe("synthetic-client-id");
    expect(readCredentials({ ...CREDS_ENV, VERCEL: "1", VERCEL_ENV: "production" })).not.toBeNull();
    expect(readCredentials({ ...CREDS_ENV, VERCEL: "1", VERCEL_ENV: "preview" })).toBeNull();
    expect(readCredentials({ ...CREDS_ENV, VERCEL: "1" })).toBeNull();
    for (const k of ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"]) expect(readCredentials({ ...CREDS_ENV, [k]: "" }), k).toBeNull();
  });

  it("estimates expiry as six calendar months after authorization", () => {
    expect(estimatedExpiry(new Date("2026-10-24T00:00:00Z")).toISOString().slice(0, 10)).toBe("2027-04-24");
    expect(estimatedExpiry(new Date("2026-08-31T00:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(parseAuthorizedAt("24 Oct 2026")).toBeNull();
    expect(parseAuthorizedAt("2026-10-24T09:30:00Z")?.toISOString()).toBe("2026-10-24T09:30:00.000Z");
  });

  it("warns only within 30 days of the estimated expiry (N5)", () => {
    const at = new Date("2026-10-24T00:00:00Z");
    expect(expiryWarning(at, new Date("2027-03-24T00:00:00Z"))).toBeNull();
    expect(expiryWarning(at, new Date("2027-03-25T00:00:00Z"))).toBe("Spotify needs reconnecting by 2027-04-24");
    expect(expiryWarning(at, new Date("2027-05-01T00:00:00Z"))).toBe("Spotify needs reconnecting by 2027-04-24");
    expect(expiryWarning(null, new Date())).toBeNull();
  });
});

describe("the client can build only the two allowlisted requests (N2)", () => {
  it("lists exactly the token endpoint (POST) and currently-playing (GET)", () => {
    expect(ALLOWED).toEqual([
      { method: "POST", url: "https://accounts.spotify.com/api/token" },
      { method: "GET", url: "https://api.spotify.com/v1/me/player/currently-playing" },
    ]);
    expect(SCOPE).toBe("user-read-currently-playing");
  });

  it.each([
    ["GET", TOKEN_URL],
    ["POST", CURRENTLY_PLAYING_URL],
    ["PUT", CURRENTLY_PLAYING_URL],
    ["GET", `${CURRENTLY_PLAYING_URL}?additional_types=episode`],
    ["GET", "https://api.spotify.com/v1/me/player"],
    ["GET", "https://api.spotify.com/v1/me"],
    ["PUT", "https://api.spotify.com/v1/me/player/pause"],
    ["POST", "https://api.spotify.com/v1/playlists/x/items"],
    ["GET", "http://api.spotify.com/v1/me/player/currently-playing"],
    ["GET", "https://api.spotify.com.example.com/v1/me/player/currently-playing"],
    ["POST", "https://accounts.spotify.com/authorize"],
    ["GET", "https://example.com/"],
  ])("refuses %s %s", (method, url) => {
    expect(() => assertAllowed(url, method)).toThrow(DisallowedRequest);
  });

  it("sends nothing else, even across every state and failure", async () => {
    const seen = new Set<string>();
    for (const read of [200, 204, 401, 429, 500]) {
      for (const token of [200, 400, 429]) {
        const s = setup({ handlers: { token: () => ({ status: token, body: token === 200 ? TOKEN_OK : { error: "invalid_grant" } }), read: () => ({ status: read, body: trackBody() }) } });
        await s.svc.read();
        for (const c of s.spotify.calls) seen.add(`${c.method} ${c.url}`);
      }
    }
    expect([...seen].sort()).toEqual([`GET ${CURRENTLY_PLAYING_URL}`, `POST ${TOKEN_URL}`]);
  });

  it("uses the refresh_token grant only, refuses redirects, and keeps the secret out of the URL", async () => {
    const s = setup();
    await s.svc.read();
    const [token, read] = s.spotify.calls;
    expect(token!.body).toBe("grant_type=refresh_token&refresh_token=synthetic-refresh-token");
    expect(token!.headers.Authorization).toBe(`Basic ${Buffer.from("synthetic-client-id:synthetic-client-secret").toString("base64")}`);
    expect(read!.headers.Authorization).toBe("Bearer synthetic-access-token");
    for (const c of s.spotify.calls) {
      expect(c.redirect).toBe("error");
      expect(c.url).not.toMatch(/synthetic/);
    }
  });

  it("caps the response size", async () => {
    const big = async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 1), { status: 200 });
    expect(await readCurrentlyPlaying("t", { fetchImpl: big, signal: new AbortController().signal })).toEqual({ kind: "error", reason: "read too-large" });
    const declared = async () => new Response("{}", { status: 200, headers: { "Content-Length": String(MAX_RESPONSE_BYTES + 1) } });
    expect(await readCurrentlyPlaying("t", { fetchImpl: declared, signal: new AbortController().signal })).toEqual({ kind: "error", reason: "read too-large" });
  });

  it("reads Retry-After in seconds, with a default and a cap", () => {
    expect(retryAfterSeconds("7")).toBe(7);
    expect(retryAfterSeconds(null)).toBe(60);
    expect(retryAfterSeconds("soon")).toBe(60);
    expect(retryAfterSeconds("99999999")).toBe(86_400);
  });

  it("tells invalid_grant, quota and rate limits apart", async () => {
    const c = readCredentials(CREDS_ENV)!;
    const sig = new AbortController().signal;
    const answer = (status: number, body: unknown, headers: Record<string, string> = {}) => async () => new Response(JSON.stringify(body), { status, headers });
    expect(await refreshAccessToken(c, { fetchImpl: answer(400, { error: "invalid_grant", error_description: "Refresh token revoked" }), signal: sig })).toEqual({ kind: "reconnect", reason: "invalid_grant" });
    expect(await readCurrentlyPlaying("t", { fetchImpl: answer(429, { error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } }, { "Retry-After": "120" }), signal: sig })).toEqual({ kind: "rate-limited", retryAfterS: 120, quota: true });
    expect(await readCurrentlyPlaying("t", { fetchImpl: answer(429, { error: { status: 429, message: "API rate limit exceeded" } }, { "Retry-After": "3" }), signal: sig })).toEqual({ kind: "rate-limited", retryAfterS: 3, quota: false });
  });
});

describe("the projection keeps only the public fields (N6, S-5)", () => {
  it("keeps track, artists, album, their links, and whether it plays", () => {
    expect(project(trackBody({ artists: ["Synthetic Artist", "Second Synthetic Artist"] }))).toEqual({
      state: "playing",
      track: {
        name: "Synthetic Track",
        url: TRACK_URL,
        artists: [
          { name: "Synthetic Artist", url: ARTIST_URL },
          { name: "Second Synthetic Artist", url: "https://open.spotify.com/artist/SyntheticArtistId00002" },
        ],
        album: { name: "Synthetic Album", url: ALBUM_URL },
      },
    });
    expect(project(trackBody({ is_playing: false }))).toMatchObject({ state: "paused" });
  });

  it("strips every other field before anything is cached: no art, device, progress or timestamps", async () => {
    const s = setup();
    await s.svc.read();
    const cached = JSON.stringify([...s.cache.data.values()].map((e) => e.value));
    for (const forbidden of ["images", "i.scdn.co", "device", "Synthetic Device", "progress", "61234", "timestamp", "context", "playlist", "preview", "duration", "explicit", "uri", "release_date", "actions", "disallows"]) {
      expect(cached, forbidden).not.toContain(forbidden);
    }
    expect(cached).not.toContain("synthetic-access-token");
  });

  it("keeps nothing of a podcast episode, and caches nothing of it", async () => {
    expect(project(episodeBody())).toEqual({ state: "podcast" });
    expect(project({ is_playing: true, currently_playing_type: "episode", item: null })).toEqual({ state: "podcast" });
    const s = setup({ handlers: { read: () => ({ status: 200, body: episodeBody() }) } });
    expect((await s.svc.read()).view).toEqual({ state: "podcast" });
    const cached = JSON.stringify([...s.cache.data.values()].map((e) => e.value));
    for (const detail of ["Synthetic Episode Title", "Synthetic Show", "Synthetic Publisher", "description", "episode/", "image"]) expect(cached, detail).not.toContain(detail);
  });

  it("keeps names exactly as supplied", () => {
    const name = "  <b>Ünïcode & “quotes”</b> — kill the lights (feat. x)  ";
    expect(project(trackBody({ name }))).toMatchObject({ track: { name } });
  });

  it("drops links that are not open.spotify.com links of the right kind", () => {
    const body = trackBody();
    body.item.external_urls.spotify = "https://evil.example.com/track/SyntheticTrackId000001";
    body.item.album.external_urls.spotify = "https://open.spotify.com/track/SyntheticTrackId000001";
    body.item.artists[0]!.external_urls.spotify = "javascript:alert(1)";
    expect(project(body)).toEqual({ state: "playing", track: { name: "Synthetic Track", url: null, artists: [{ name: "Synthetic Artist", url: null }], album: { name: "Synthetic Album", url: null } } });
  });

  it("withholds details that trip the display guards, logging rule IDs only", () => {
    const logs: string[] = [];
    // Built at run time, so the repository guard does not flag this file.
    const digits = "7".repeat(19);
    expect(project(trackBody({ name: `Track ${digits}` }), { log: (m) => logs.push(m) })).toEqual({ state: "playing", track: null });
    expect(logs.join("\n")).toContain("long-numeric-id");
    expect(logs.join("\n")).not.toContain(digits);
  });

  it("an ad or an unknown item says only whether something plays; nonsense is nothing playing", () => {
    expect(project({ is_playing: true, currently_playing_type: "ad", item: null })).toEqual({ state: "playing", track: null });
    expect(project({ is_playing: false, currently_playing_type: "unknown", item: null })).toEqual({ state: "nothing" });
    expect(project({ is_playing: "yes" }, { log: () => {} })).toEqual({ state: "nothing" });
  });
});

describe("every state (N7, S-6)", () => {
  const cases: Array<[string, Parameters<typeof setup>[0], NowPlayingView["state"]]> = [
    ["playing", {}, "playing"],
    ["paused", { handlers: { read: () => ({ status: 200, body: trackBody({ is_playing: false }) }) } }, "paused"],
    ["nothing playing (204)", { handlers: { read: () => ({ status: 204 }) } }, "nothing"],
    ["a podcast", { handlers: { read: () => ({ status: 200, body: episodeBody() }) } }, "podcast"],
    ["not sharing", { env: { NOW_PLAYING_SHARING: "off" } }, "not-sharing"],
    ["can't reach Spotify (no last good)", { handlers: { read: () => ({ status: 503 }) } }, "unreachable"],
    ["can't reach Spotify (no credentials)", { env: { SPOTIFY_REFRESH_TOKEN: "" } }, "unreachable"],
  ];
  it.each(cases)("%s", async (_name, opts, state) => {
    const s = setup(opts);
    expect((await s.svc.read()).view.state).toBe(state);
  });

  it("sharing paused makes no Spotify call and reads no cache", async () => {
    const s = setup({ env: { NOW_PLAYING_SHARING: "off" } });
    for (let i = 0; i < 5; i++) await s.svc.read();
    expect(s.spotify.calls).toEqual([]);
    expect(s.cache.gets).toBe(0);
  });

  it("on failure serves the last good projection with its time", async () => {
    let fail = false;
    const s = setup({ handlers: { read: () => (fail ? { status: 502 } : { status: 200, body: trackBody() }) } });
    const first = await s.svc.read();
    fail = true;
    s.clock.advance(5 * 60_000);
    const later = await s.svc.read();
    expect(later.view).toEqual(first.view);
    expect(later.checkedAt).toBe(first.checkedAt);
    expect(ageText(later.checkedAt, later.servedAt)).toBe("As of 5 minutes ago");
    expect(s.logs).toContain("now playing: Spotify read failed (read status 502)");
  });
});

describe("one Spotify call per 30 seconds across every instance (N4, S-3)", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("under concurrent requests to five instances sharing one cache (interleaving %i)", async (seed) => {
    const s = setup({ instances: 5, seed });
    const burst = (n: number) => Promise.all(Array.from({ length: n }, (_, i) => s.services[i % s.services.length]!.read()));
    const windows: number[] = [];
    let before = 0;
    for (let w = 0; w < 6; w++) {
      // Three bursts inside one 30-second window.
      for (const step of [0, 10_000, 19_000]) {
        if (step) s.clock.advance(step - (step === 19_000 ? 10_000 : 0));
        const results = await burst(40);
        for (const r of results) expect(r.view.state).toBe("playing");
      }
      windows.push(s.spotify.reads() - before);
      before = s.spotify.reads();
      s.clock.advance(SHARED_TTL_MS - 19_000 + 1);
    }
    expect(windows).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("never twice within 30 s, however requests are spread", async () => {
    const s = setup({ instances: 4, seed: 42 });
    const random = rng(7);
    const callTimes: number[] = [];
    const original = s.spotify.fetchImpl;
    // Wrap the transport to record when each read happens.
    s.services.splice(0, s.services.length, ...Array.from({ length: 4 }, () =>
      createNowPlayingService({
        cache: s.cache,
        env: s.env,
        now: s.clock.now,
        log: () => {},
        settleMs: SETTLE,
        fetchImpl: async (url, init) => {
          if (url === CURRENTLY_PLAYING_URL) callTimes.push(s.clock.now());
          return original(url, init);
        },
      }),
    ));
    for (let i = 0; i < 300; i++) {
      s.clock.advance(Math.floor(random() * 4_000));
      await Promise.all(Array.from({ length: 1 + Math.floor(random() * 6) }, () => s.services[Math.floor(random() * 4)]!.read()));
    }
    expect(callTimes.length).toBeGreaterThan(10);
    for (let i = 1; i < callTimes.length; i++) expect(callTimes[i]! - callTimes[i - 1]!).toBeGreaterThanOrEqual(SHARED_TTL_MS);
  });

  it("an instance keeps the 30-second floor even when the shared cache fails", async () => {
    const s = setup();
    const broken: SharedCache = { get: async () => Promise.reject(new Error("down")), set: async () => Promise.reject(new Error("down")) };
    const svc = createNowPlayingService({ cache: broken, fetchImpl: s.spotify.fetchImpl, env: s.env, now: s.clock.now, log: (m) => s.logs.push(m), settleMs: SETTLE });
    await Promise.all(Array.from({ length: 20 }, () => svc.read()));
    s.clock.advance(15_000);
    await svc.read();
    expect(s.spotify.reads()).toBe(1);
    s.clock.advance(15_001);
    await svc.read();
    expect(s.spotify.reads()).toBe(2);
    expect(s.logs).toContain("now playing: shared cache unavailable; using this instance's memory");
  });

  it("refreshes the access token only when it is about to expire", async () => {
    const s = setup();
    for (let i = 0; i < 10; i++) {
      await s.svc.read();
      s.clock.advance(SHARED_TTL_MS);
    }
    expect(s.spotify.reads()).toBe(10);
    expect(s.spotify.tokens()).toBe(1);
  });
});

describe("failures (N5)", () => {
  it("invalid_grant stops retries on every instance, and visitors see that Spotify can't be reached", async () => {
    const s = setup({ instances: 3, handlers: { token: () => ({ status: 400, body: { error: "invalid_grant", error_description: "Refresh token revoked" } }) } });
    expect((await s.svc.read()).view).toEqual({ state: "unreachable" });
    expect(s.logs).toContain("Spotify reconnect needed");
    for (let i = 0; i < 20; i++) {
      s.clock.advance(SHARED_TTL_MS + 1);
      for (const svc of s.services) expect((await svc.read()).view).toEqual({ state: "unreachable" });
    }
    expect(s.spotify.tokens()).toBe(1);
    expect(s.spotify.reads()).toBe(0);
    expect(s.cache.data.get(KEYS.block)?.value).toMatchObject({ kind: "reconnect" });
  });

  it("invalid_grant hides the last good projection too", async () => {
    let revoked = false;
    const s = setup({ handlers: { token: () => (revoked ? { status: 400, body: { error: "invalid_grant" } } : { status: 200, body: { ...TOKEN_OK, expires_in: 60 } }) } });
    expect((await s.svc.read()).view.state).toBe("playing");
    revoked = true;
    s.clock.advance(SHARED_TTL_MS + 1);
    expect((await s.svc.read()).view).toEqual({ state: "unreachable" });
  });

  it("new credentials clear the reconnect state", async () => {
    const s = setup({ handlers: { token: () => ({ status: 400, body: { error: "invalid_grant" } }) } });
    await s.svc.read();
    const fixed = fakeSpotify();
    const svc = createNowPlayingService({ cache: s.cache, fetchImpl: fixed.fetchImpl, env: { ...s.env, SPOTIFY_REFRESH_TOKEN: "synthetic-refresh-token-2" }, now: s.clock.now, log: () => {}, settleMs: SETTLE });
    s.clock.advance(SHARED_TTL_MS + 1);
    expect((await svc.read()).view.state).toBe("playing");
  });

  it("429 honours Retry-After and serves the last good projection meanwhile", async () => {
    let limited = false;
    const s = setup({ instances: 2, handlers: { read: () => (limited ? { status: 429, headers: { "Retry-After": "120" }, body: { error: { status: 429, message: "API rate limit exceeded" } } } : { status: 200, body: trackBody() }) } });
    const good = await s.svc.read();
    limited = true;
    s.clock.advance(SHARED_TTL_MS + 1);
    expect((await s.svc.read()).view).toEqual(good.view);
    expect(s.logs).toContain("now playing: Spotify rate limit; waiting 120 s");
    const readsAfter429 = s.spotify.reads();
    for (let t = 0; t < 110_000; t += 10_000) {
      s.clock.advance(10_000);
      for (const svc of s.services) expect((await svc.read()).view).toEqual(good.view);
    }
    expect(s.spotify.reads()).toBe(readsAfter429);
    limited = false;
    s.clock.advance(10_000);
    await s.svc.read();
    expect(s.spotify.reads()).toBe(readsAfter429 + 1);
  });

  it("logs a quota 429 as a quota", async () => {
    const s = setup({ handlers: { read: () => ({ status: 429, headers: { "Retry-After": "600" }, body: { error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } } }) } });
    await s.svc.read();
    expect(s.logs).toContain("now playing: Spotify quota exceeded; waiting 600 s");
  });

  it("within 30 days of the estimated expiry every refresh logs the reconnect date; before then, none", async () => {
    const early = setup({ env: { SPOTIFY_AUTHORIZED_AT: "2026-10-01" } });
    await early.svc.read();
    expect(early.logs.filter((l) => l.startsWith("Spotify needs reconnecting"))).toEqual([]);
    const s = setup({ env: { SPOTIFY_AUTHORIZED_AT: "2026-05-10" }, handlers: { token: () => ({ status: 200, body: { ...TOKEN_OK, expires_in: 60 } }) } });
    await s.svc.read();
    s.clock.advance(SHARED_TTL_MS + 1);
    await s.svc.read();
    expect(s.spotify.tokens()).toBe(2);
    expect(s.logs.filter((l) => l.startsWith("Spotify needs reconnecting"))).toEqual(["Spotify needs reconnecting by 2026-11-10", "Spotify needs reconnecting by 2026-11-10"]);
  });

  it("uses a new refresh token in memory, says so once, and never logs it", async () => {
    const s = setup({ handlers: { token: () => ({ status: 200, body: { ...TOKEN_OK, expires_in: 60, refresh_token: "synthetic-new-refresh-token" } }) } });
    await s.svc.read();
    s.clock.advance(SHARED_TTL_MS + 1);
    await s.svc.read();
    expect(s.spotify.calls.filter((c) => c.url === TOKEN_URL).map((c) => c.body)).toEqual([
      "grant_type=refresh_token&refresh_token=synthetic-refresh-token",
      "grant_type=refresh_token&refresh_token=synthetic-new-refresh-token",
    ]);
    expect(s.logs.filter((l) => l === "Spotify issued a new refresh token; reconnect may be needed")).toHaveLength(1);
  });

  it("never logs a token, code or secret", async () => {
    const all: string[] = [];
    for (const handlers of [
      { token: () => ({ status: 400, body: { error: "invalid_grant", error_description: "synthetic-refresh-token is revoked" } }) },
      { token: () => ({ status: 200, body: { ...TOKEN_OK, refresh_token: "synthetic-new-refresh-token" } }) },
      { read: () => ({ status: 401 }) },
      { read: () => ({ status: 429, body: { access_token: "synthetic-access-token" } }) },
      { read: () => ({ status: 500, body: { echo: "synthetic-client-secret" } }) },
    ]) {
      const s = setup({ handlers, env: { SPOTIFY_AUTHORIZED_AT: "2026-04-01" } });
      await s.svc.read();
      all.push(...s.logs);
    }
    const text = all.join("\n");
    for (const secret of [...SECRETS, "synthetic-client-id"]) expect(text).not.toContain(secret);
  });

  it("nobody waits longer than the client timeout", async () => {
    const s = setup();
    const hang = async (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
    const svc = createNowPlayingService({ cache: s.cache, fetchImpl: hang, env: s.env, now: () => Date.now(), log: () => {} });
    const started = Date.now();
    const r = await svc.read();
    expect(Date.now() - started).toBeLessThan(CLIENT_TIMEOUT_MS + 500);
    expect(r.view).toEqual({ state: "unreachable" });
  }, 10_000);
});

describe("rendering (N7, N9)", () => {
  const now = Date.UTC(2026, 9, 24, 12);
  const render = (view: NowPlayingView, checkedAt: number | null = now) => renderToStaticMarkup(<NowPlayingBody view={view} checkedAt={checkedAt} servedAt={now} />);
  const track = { name: "Synthetic Track", url: TRACK_URL, artists: [{ name: "Synthetic Artist", url: ARTIST_URL }], album: { name: "Synthetic Album", url: ALBUM_URL } };

  it("renders the label verbatim, with the emoji hidden from screen readers", () => {
    expect(NOW_PLAYING_LABEL).toBe("What is Matty vibing to? ❤️");
    expect(labelText()).toBe("What is Matty vibing to?");
    const html = render({ state: "nothing" });
    expect(html).toContain('<h2 id="now-playing-label" class="now-playing-label">What is Matty vibing to? <span aria-hidden="true">❤️</span></h2>');
    // The visible text is the label, byte for byte.
    expect(html.match(/<h2[^>]*>(.*?)<\/h2>/)![1]!.replace(/<[^>]+>/g, "")).toBe(NOW_PLAYING_LABEL);
  });

  it.each(Object.entries(STATE_TEXT))("states %s in words", (state, text) => {
    const view = (state === "playing" || state === "paused" ? { state, track } : { state }) as NowPlayingView;
    expect(render(view)).toContain(`data-state="${state}">${text}</p>`);
  });

  it("links the track, artists and album back to Spotify, and shows no image but Spotify's logo", () => {
    const html = render({ state: "playing", track });
    for (const href of [TRACK_URL, ARTIST_URL, ALBUM_URL]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toMatch(/<svg|<iframe|<script/);
    expect([...html.matchAll(/<img [^>]*>/g)].map((m) => m[0])).toEqual([
      '<img class="spotify-logo-white" src="/brand/third-party/spotify/Full_Logo_White_RGB.svg" alt="Spotify" width="120" height="33"/>',
      '<img class="spotify-logo-black" src="/brand/third-party/spotify/Full_Logo_Black_RGB.svg" alt="Spotify" width="120" height="33"/>',
    ]);
  });

  it("attributes with the logo in every state that shows Spotify content, and only there", () => {
    const withLogo = (v: NowPlayingView) => render(v).includes('class="spotify-logo"');
    expect(withLogo({ state: "playing", track })).toBe(true);
    expect(withLogo({ state: "paused", track })).toBe(true);
    for (const v of [{ state: "playing", track: null }, { state: "podcast" }, { state: "nothing" }, { state: "not-sharing" }, { state: "unreachable" }] as NowPlayingView[]) {
      expect(withLogo(v), v.state).toBe(false);
    }
  });

  it("escapes names and shows them as supplied", () => {
    const html = render({ state: "playing", track: { ...track, name: "<script>alert(1)</script> & “Ünïcode”" } });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; “Ünïcode”");
    expect(html).not.toContain("<script>");
  });

  it("attaches the crisis block, verbatim, when a name mentions suicide", () => {
    for (const t of [{ ...track, name: "Synthetic Suicide Song" }, { ...track, artists: [{ name: "Suicidal Synthetic", url: null }] }, { ...track, album: { name: "On suicide", url: null } }]) {
      const html = render({ state: "playing", track: t });
      expect(html).toContain("data-crisis-support");
      expect(html).toContain(CRISIS_SUPPORT_TEXT);
    }
    expect(render({ state: "playing", track })).not.toContain("data-crisis-support");
  });

  it("shows the age of an old answer, from the server's clock", () => {
    expect(render({ state: "playing", track }, now - 30_000)).not.toContain("As of");
    expect(render({ state: "playing", track }, now - 61_000)).toContain("As of 1 minute ago");
    expect(render({ state: "playing", track }, now - 3 * 3_600_000)).toContain("As of 3 hours ago");
  });
});

describe("the flag off (N1)", () => {
  it("the API answers 404", async () => {
    vi.stubEnv("NOW_PLAYING_ENABLED", "");
    const { GET, POST } = await import("@/app/api/now-playing/route");
    expect((await GET()).status).toBe(404);
    expect(POST().status).toBe(404);
  });

  it("the API answers with the projection once it is on", async () => {
    vi.stubEnv("NOW_PLAYING_ENABLED", "true");
    vi.stubEnv("NOW_PLAYING_SHARING", "off");
    const { GET } = await import("@/app/api/now-playing/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ view: { state: "not-sharing" }, checkedAt: null });
  });

  it("the landing page reads nothing and renders exactly as before", async () => {
    vi.stubEnv("SITE_MODE", "landing");
    vi.stubEnv("NOW_PLAYING_ENABLED", "");
    const spy = vi.spyOn(globalThis, "fetch");
    const { default: HomePage } = await import("@/app/page");
    const { LandingPage } = await import("@/components/landing/LandingPage");
    expect(renderToStaticMarkup(await HomePage())).toBe(renderToStaticMarkup(<LandingPage />));
    expect(renderToStaticMarkup(<LandingPage />)).not.toContain("now-playing");
    expect(spy).not.toHaveBeenCalled();
  });

  it("the privacy notice stays landing-1", async () => {
    vi.stubEnv("SITE_MODE", "landing");
    vi.stubEnv("NOW_PLAYING_ENABLED", "");
    const { default: PrivacyPage } = await import("@/app/privacy/page");
    const html = renderToStaticMarkup(await PrivacyPage());
    expect(html).toContain("Version landing-1");
    expect(html).not.toContain("Spotify");
  });
});
