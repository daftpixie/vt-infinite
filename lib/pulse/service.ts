import "server-only";
import { randomUUID } from "node:crypto";
import type { Env } from "@/lib/flags";
import { publicPulseEnabled, statsCredentials } from "./config";
import { readHistory, readRecent, StatsUnavailable, type FetchImpl } from "./client";
import { aggregatePaths } from "./public-paths";
import { DEFINITIONS, HISTORY_FRESH_MS, overallStatus, RECENT_FRESH_MS, REPORTING_TIME_ZONE, type History, type PulseResult, type Reading, type Recent } from "./model";
import { pulseStore, type PulseKind, type PulseStore } from "./store";
import { pulseScope } from "./keys";
import { validHistory, validRecent } from "./validation";

type Deps = { store?: PulseStore; env?: Env; now?: () => number; fetchImpl?: FetchImpl; paths?: string[] };

export function createPulseService(deps: Deps = {}) {
  const now = deps.now ?? Date.now;
  const inflight = new Map<string, Promise<Reading<Recent | History>>>();

  async function read(env: Env = deps.env ?? process.env): Promise<PulseResult | null> {
    // Off means no persistence reads, no upstream calls, no old projection.
    if (!publicPulseEnabled(env)) return null;
    const credentials = statsCredentials(env);
    const paths = deps.paths ?? aggregatePaths(env);
    const store = deps.store ?? pulseStore(env);
    const scope = pulseScope(env.PLAUSIBLE_SITE_ID ?? "", paths);

    async function one<T extends Recent | History>(kind: PulseKind, freshness: number, validate: (v: unknown) => T | null, fetchData: (end: number) => Promise<T>): Promise<Reading<T>> {
      const key = `pulse:v1:${scope}:${kind}`;
      const running = inflight.get(key);
      if (running) return running as Promise<Reading<T>>;
      const job = (async (): Promise<Reading<T>> => {
        let data: T | null = null;
        try { data = validate(await store.load(key)); } catch { /* Honest unavailable state; no upstream or credential details are logged. */ }
        const fresh = data !== null && now() >= Date.parse(data.readAt) && now() - Date.parse(data.readAt) < freshness;
        if (fresh && credentials) return { status: "fresh", data };
        const fallback = (): Reading<T> => ({ status: data ? "stale" : "unavailable", data });
        if (!credentials || (!deps.fetchImpl && (env.NODE_ENV === "test" || env.CI || env.PLAYWRIGHT_TEST))) return fallback();
        const owner = randomUUID();
        try {
          if (!await store.claim(key, owner, now(), now() + freshness)) return fallback();
          const end = Math.floor(now() / 1000) * 1000;
          const candidate = await fetchData(end);
          // Read completion time belongs to the source; never rewrite it when falling back.
          const projected = validate({ ...candidate, readAt: new Date(now()).toISOString() });
          if (!projected) throw new StatsUnavailable();
          await store.save(key, projected);
          return { status: "fresh", data: projected };
        } catch (error) {
          try { await store.defer(key, owner, now() + Math.max(freshness, error instanceof StatsUnavailable ? error.retryAfterMs : freshness)); } catch { /* A failed lease stays closed. */ }
          return fallback();
        }
      })().finally(() => inflight.delete(key));
      inflight.set(key, job as Promise<Reading<Recent | History>>);
      return job;
    }

    const [recent, history] = await Promise.all([
      one("recent", RECENT_FRESH_MS, validRecent, (end) => readRecent(credentials!, paths, end, deps.fetchImpl)),
      one("history", HISTORY_FRESH_MS, validHistory, (end) => readHistory(credentials!, paths, end, deps.fetchImpl)),
    ]);
    return { status: overallStatus(recent, history), timezone: REPORTING_TIME_ZONE, servedAt: new Date(now()).toISOString(), recent, history, definitions: DEFINITIONS };
  }
  return { read };
}

let shared: ReturnType<typeof createPulseService> | null = null;
export async function readPulse(): Promise<PulseResult | null> {
  // Avoid even creating the service/store when publication is off.
  if (!publicPulseEnabled()) return null;
  shared ??= createPulseService();
  return shared.read();
}
