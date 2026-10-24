import { createHash, randomUUID } from "node:crypto";
import { getCache } from "@vercel/functions";
import { z } from "zod";
import type { Env } from "@/lib/flags";
import { CLIENT_TIMEOUT_MS, readCurrentlyPlaying, refreshAccessToken, type FetchImpl } from "./client";
import { expiryWarning, readCredentials, sharingOn, type Credentials } from "./config";
import { fixtureFetch } from "./fixture";
import { project, type NowPlayingView } from "./projection";

/**
 * "Now playing", shared by every instance (PRD S-3 to S-6; ADR 0009).
 *
 * Visitors never trigger more than one Spotify read per 30 seconds:
 *
 * 1. The last projection lives in Vercel's Runtime Cache, which every
 *    instance of the deployment's functions in a region reads and writes
 *    (getCache from @vercel/functions). A projection younger than 30 s is
 *    served as it is.
 * 2. Before reading Spotify, an instance takes a 30-second lease in the
 *    same cache, by Fischer's timed mutual exclusion: it checks that no
 *    lease younger than 30 s exists, writes its own ID with the time, waits
 *    SETTLE_MS, reads the lease back, and goes ahead only if it is still its
 *    own. An instance whose own check-then-write took longer than half of
 *    SETTLE_MS gives up instead. So any rival that saw no lease has written
 *    before the read-back, the last writer alone goes ahead, and the others
 *    wait for its projection. The lease is never released early, so a
 *    failed read still waits out its 30 s.
 * 3. Inside an instance, concurrent requests share one read, and the
 *    instance keeps its own 30-second floor even if the cache is down.
 *
 * Fischer's method needs a cache that answers every read with the latest
 * write, and writes that land within the time measured. Vercel documents
 * the Runtime Cache as regional, with get, set and tag expiry only, and
 * does not document its consistency; two regions, or a cache that answers
 * stale, could each let one read through. ADR 0009 states this limit; it
 * was accepted rather than adding a datastore (Matthew, 24 Oct 2026).
 *
 * Nobody waits longer than CLIENT_TIMEOUT_MS. On any failure the last good
 * projection is served with its time, or "Can't reach Spotify right now".
 * Tokens stay in memory. Nothing is written to a database.
 */
export const SHARED_TTL_S = 30;
export const SHARED_TTL_MS = SHARED_TTL_S * 1000;
/** How long the last good projection is kept to fall back on. */
export const LAST_GOOD_TTL_S = 24 * 60 * 60;
/** A reconnect-needed state is kept this long in the shared cache (and for the life of each instance). */
export const RECONNECT_TTL_S = 7 * 24 * 60 * 60;
/** Fischer's wait between writing the lease and reading it back. */
export const SETTLE_MS = 250;
/** How often an instance that lost the lease looks for the winner's projection. */
const WAIT_POLL_MS = 100;
/** Refresh the access token this long before Spotify says it expires. */
const TOKEN_MARGIN_MS = 60_000;

export const CACHE_NAMESPACE = "vt-now-playing-v1";
export const KEYS = { snapshot: "snapshot", lease: "lease", block: "block" } as const;

/**
 * What the page and the API return. `checkedAt` is when Spotify last
 * answered (ms), if ever; `servedAt` is the server's time when this was
 * served, so the browser can show the age without trusting its own clock.
 */
export type NowPlayingResult = { view: NowPlayingView; checkedAt: number | null; servedAt: number };
type Projected = Omit<NowPlayingResult, "servedAt">;

export type SharedCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, options: { ttl: number }) => Promise<void>;
};

const LinkS = z.object({ name: z.string(), url: z.string().nullable() }).strict();
const ViewS = z.union([
  z.object({ state: z.enum(["playing", "paused"]), track: z.object({ name: z.string(), url: z.string().nullable(), artists: z.array(LinkS), album: LinkS.nullable() }).strict().nullable() }).strict(),
  z.object({ state: z.enum(["podcast", "nothing"]) }).strict(),
]);
const SnapshotS = z.object({ view: ViewS, checkedAt: z.number() }).strict();
type Snapshot = z.infer<typeof SnapshotS>;
const LeaseS = z.object({ owner: z.string(), at: z.number() }).strict();
const BlockS = z.union([
  z.object({ kind: z.literal("reconnect"), credentials: z.string() }).strict(),
  z.object({ kind: z.literal("backoff"), until: z.number() }).strict(),
]);

export type ServiceDeps = {
  cache?: SharedCache;
  fetchImpl?: FetchImpl;
  env?: Env;
  now?: () => number;
  log?: (m: string) => void;
  /** Fischer's wait (tests shorten it). */
  settleMs?: number;
};

const UNREACHABLE: Projected = { view: { state: "unreachable" }, checkedAt: null };

/** A short, one-way label for the credentials, so a reconnect-needed state clears itself when they change. Never logged. */
function credentialsKey(c: Credentials): string {
  return createHash("sha256").update(`${c.clientId}\n${c.refreshToken}`).digest("hex").slice(0, 16);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}

function timeoutAfter<T>(ms: number, value: T): { promise: Promise<T>; cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<T>((resolve) => {
    t = setTimeout(() => resolve(value), ms);
  });
  return { promise, cancel: () => clearTimeout(t) };
}

/**
 * One service per instance. The app uses `readNowPlaying` below; tests
 * build several over one cache to stand in for several instances.
 */
export function createNowPlayingService(deps: ServiceDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((m: string) => console.warn(m));
  const cache = (): SharedCache => deps.cache ?? (getCache({ namespace: CACHE_NAMESPACE }) as SharedCache);
  const id = randomUUID();
  const settleMs = deps.settleMs ?? SETTLE_MS;

  // Instance memory. Access tokens and a replacement refresh token live only here.
  let token: { value: string; expiresAt: number; credentials: string } | null = null;
  let issuedRefreshToken: { credentials: string; value: string } | null = null;
  let reconnect: string | null = null;
  let lastCallAt = Number.NEGATIVE_INFINITY;
  let lastGood: Snapshot | null = null;
  let inflight: Promise<Projected> | null = null;
  const said = new Set<string>();
  const once = (m: string) => {
    if (said.has(m)) return;
    said.add(m);
    log(m);
  };

  async function cacheGet<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    try {
      const v = await cache().get(key);
      const parsed = schema.safeParse(v);
      return parsed.success ? parsed.data : null;
    } catch {
      once("now playing: shared cache unavailable; using this instance's memory");
      return null;
    }
  }
  async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
    try {
      await cache().set(key, value, { ttl });
    } catch {
      once("now playing: shared cache unavailable; using this instance's memory");
    }
  }

  const newest = (a: Snapshot | null, b: Snapshot | null) => (!a ? b : !b ? a : a.checkedAt >= b.checkedAt ? a : b);
  const fallback = (snap: Snapshot | null): Projected => (snap ? { view: snap.view, checkedAt: snap.checkedAt } : UNREACHABLE);

  async function store(view: Snapshot["view"]): Promise<Projected> {
    const snap: Snapshot = { view, checkedAt: now() };
    lastGood = snap;
    await cacheSet(KEYS.snapshot, snap, LAST_GOOD_TTL_S);
    return fallback(snap);
  }

  /**
   * Take the shared 30-second lease (Fischer's method, above). "own" if this
   * instance read Spotify within 30 s; "held" if another did or won.
   */
  async function takeLease(signal: AbortSignal): Promise<"taken" | "own" | "held"> {
    if (now() - lastCallAt < SHARED_TTL_MS) return "own";
    const started = performance.now();
    const held = await cacheGet(KEYS.lease, LeaseS);
    if (held && now() - held.at < SHARED_TTL_MS) return "held";
    const mine = { owner: `${id}:${randomUUID()}`, at: now() };
    await cacheSet(KEYS.lease, mine, SHARED_TTL_S);
    // Too slow between the check and the write: a rival could have checked and written after us unseen.
    if (performance.now() - started > settleMs / 2) return "held";
    await sleep(settleMs, signal);
    if (signal.aborted) return "held";
    const back = await cacheGet(KEYS.lease, LeaseS);
    // A cache that answered nothing leaves the instance floor as the bound.
    if (back && back.owner !== mine.owner) return "held";
    lastCallAt = now();
    return "taken";
  }

  /** Another instance holds the lease: wait, within the deadline, for the projection it is fetching. */
  async function awaitWinner(previous: Snapshot | null, signal: AbortSignal): Promise<Snapshot | null> {
    while (!signal.aborted) {
      await sleep(WAIT_POLL_MS, signal);
      const snap = await cacheGet(KEYS.snapshot, SnapshotS);
      if (snap && (!previous || snap.checkedAt > previous.checkedAt)) return snap;
    }
    return previous;
  }

  async function accessToken(c: Credentials, key: string, signal: AbortSignal, fetchImpl: FetchImpl) {
    if (token && token.credentials === key && token.expiresAt - TOKEN_MARGIN_MS > now()) return { kind: "token" as const, value: token.value };
    const warning = expiryWarning(c.authorizedAt, new Date(now()));
    if (warning) log(warning);
    const refreshToken = issuedRefreshToken?.credentials === key ? issuedRefreshToken.value : c.refreshToken;
    const r = await refreshAccessToken({ ...c, refreshToken }, { fetchImpl, signal });
    if (r.kind !== "token") return r;
    if (r.newRefreshToken) {
      issuedRefreshToken = { credentials: key, value: r.newRefreshToken };
      log("Spotify issued a new refresh token; reconnect may be needed");
    }
    token = { value: r.accessToken, expiresAt: now() + r.expiresInS * 1000, credentials: key };
    return { kind: "token" as const, value: r.accessToken };
  }

  async function cycle(env: Env, signal: AbortSignal): Promise<Projected> {
    const snap = newest(await cacheGet(KEYS.snapshot, SnapshotS), lastGood);
    if (snap && now() - snap.checkedAt < SHARED_TTL_MS) return fallback(snap);

    const c = readCredentials(env);
    if (!c) {
      once("now playing: Spotify credentials are not set");
      return fallback(snap);
    }
    const key = credentialsKey(c);
    if (reconnect === key) return UNREACHABLE;
    const block = await cacheGet(KEYS.block, BlockS);
    if (block?.kind === "reconnect" && block.credentials === key) {
      reconnect = key;
      once("Spotify reconnect needed");
      return UNREACHABLE;
    }
    if (block?.kind === "backoff" && block.until > now()) return fallback(snap);
    const lease = await takeLease(signal);
    // Only a visitor with nothing at all to show waits for the winner; the rest get the last projection now.
    if (lease === "held") return fallback(snap ?? (await awaitWinner(snap, signal)));
    if (lease === "own") return fallback(snap);

    const fetchImpl = deps.fetchImpl ?? fixtureFetch(env) ?? fetch;
    const t = await accessToken(c, key, signal, fetchImpl);
    const r = t.kind === "token" ? await readCurrentlyPlaying(t.value, { fetchImpl, signal }) : t;
    switch (r.kind) {
      case "nothing":
        return store({ state: "nothing" });
      case "playing-body":
        return store(project(r.body, { env, log }));
      case "reconnect":
        // No retry loop: every instance stops until the credentials change.
        reconnect = key;
        token = null;
        await cacheSet(KEYS.block, { kind: "reconnect", credentials: key }, RECONNECT_TTL_S);
        log(r.reason === "invalid_client" ? "Spotify reconnect needed (client credentials refused)" : "Spotify reconnect needed");
        return UNREACHABLE;
      case "rate-limited":
        await cacheSet(KEYS.block, { kind: "backoff", until: now() + r.retryAfterS * 1000 }, r.retryAfterS);
        log(`now playing: Spotify ${r.quota ? "quota exceeded" : "rate limit"}; waiting ${r.retryAfterS} s`);
        return fallback(snap);
      case "unauthorized":
        token = null;
        log("now playing: Spotify refused the access token; refreshing on the next read");
        return fallback(snap);
      case "error":
        log(`now playing: Spotify read failed (${r.reason})`);
        return fallback(snap);
    }
  }

  /** The current projection, within CLIENT_TIMEOUT_MS. Sharing paused: no cache read, no Spotify call. */
  async function read(env: Env = deps.env ?? process.env): Promise<NowPlayingResult> {
    if (!sharingOn(env)) return { view: { state: "not-sharing" }, checkedAt: null, servedAt: now() };
    if (!inflight) {
      const signal = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
      inflight = cycle(env, signal)
        .catch(() => fallback(lastGood))
        .finally(() => {
          inflight = null;
        });
    }
    const deadline = timeoutAfter(CLIENT_TIMEOUT_MS, null);
    const result = await Promise.race([inflight, deadline.promise]);
    deadline.cancel();
    return { ...(result ?? (reconnect ? UNREACHABLE : fallback(lastGood))), servedAt: now() };
  }

  return { read };
}

let shared: ReturnType<typeof createNowPlayingService> | null = null;

/** This instance's service. */
export function readNowPlaying(env: Env = process.env): Promise<NowPlayingResult> {
  shared ??= createNowPlayingService();
  return shared.read(env);
}
