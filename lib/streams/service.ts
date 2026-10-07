import { getSnapshotStore, type SnapshotStore } from "@/lib/storage";
import { enabledPublications, isWithdrawn, STREAMS, type Publication, type StreamsConfig } from "./config";
import { fetchFeed, type FetchImpl } from "./fetch";
import { parseFeed, type StreamItem } from "./parse";

/** At most one fetch per publication per fifteen minutes (PRD SS-2). */
export const REFRESH_FLOOR_MS = 15 * 60 * 1000;
/** Longest wait between attempts after repeated failures. */
export const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** A last good read older than this is labeled stale. */
export const STALE_AFTER_MS = 60 * 60 * 1000;
export const SCHEMA_VERSION = 1;

type StreamData = { items: StreamItem[]; etag: string | null; lastModified: string | null };
type StreamMeta = { lastAttemptAt: string; consecutiveFailures: number; nextAttemptAt: string };

const dataKey = (id: string) => `stream:${id}`;
const metaKey = (id: string) => `stream-meta:${id}`;

export type RefreshResult = "skipped" | "updated" | "not-modified" | "failed";

type Deps = { store?: SnapshotStore; fetchImpl?: FetchImpl; now?: () => Date; log?: (msg: string) => void; env?: Readonly<Record<string, string | undefined>> };

const inFlight = new Map<string, Promise<RefreshResult>>();

/**
 * Refresh one publication's snapshot. Concurrent callers share one fetch.
 * A failure never replaces the last good projection (SS-5); it only
 * schedules the next attempt with exponential backoff.
 */
export function refreshPublication(pub: Publication, deps: Deps = {}): Promise<RefreshResult> {
  const running = inFlight.get(pub.id);
  if (running) return running;
  const p = doRefresh(pub, deps).finally(() => inFlight.delete(pub.id));
  inFlight.set(pub.id, p);
  return p;
}

async function doRefresh(pub: Publication, deps: Deps): Promise<RefreshResult> {
  const store = deps.store ?? getSnapshotStore("refresh");
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((m: string) => console.warn(m));
  if (!pub.enabled) return "skipped";

  const meta = await store.get<StreamMeta>(metaKey(pub.id));
  if (meta) {
    if (now.getTime() < Date.parse(meta.data.nextAttemptAt)) return "skipped";
    if (now.getTime() - Date.parse(meta.data.lastAttemptAt) < REFRESH_FLOOR_MS) return "skipped";
  }
  const prior = await store.get<StreamData>(dataKey(pub.id));
  const outcome = await fetchFeed(pub.feed, { etag: prior?.data.etag, lastModified: prior?.data.lastModified, fetchImpl: deps.fetchImpl });

  const fail = async (reason: string): Promise<RefreshResult> => {
    const failures = (meta?.data.consecutiveFailures ?? 0) + 1;
    const wait = Math.min(REFRESH_FLOOR_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
    await store.put<StreamMeta>(metaKey(pub.id), {
      schemaVersion: SCHEMA_VERSION,
      fetchedAt: now.toISOString(),
      data: { lastAttemptAt: now.toISOString(), consecutiveFailures: failures, nextAttemptAt: new Date(now.getTime() + wait).toISOString() },
    });
    log(`streams: ${pub.id} refresh failed (${reason}); attempt ${failures}`);
    return "failed";
  };
  const succeed = async () =>
    store.put<StreamMeta>(metaKey(pub.id), {
      schemaVersion: SCHEMA_VERSION,
      fetchedAt: now.toISOString(),
      data: { lastAttemptAt: now.toISOString(), consecutiveFailures: 0, nextAttemptAt: new Date(now.getTime() + REFRESH_FLOOR_MS).toISOString() },
    });

  if (outcome.kind === "error") return fail(outcome.reason);
  if (outcome.kind === "not-modified") {
    if (!prior) return fail("not-modified without a prior read");
    await store.put<StreamData>(dataKey(pub.id), { ...prior, fetchedAt: now.toISOString() });
    await succeed();
    return "not-modified";
  }
  const parsed = parseFeed(outcome.body, pub, deps.env);
  if (!parsed.ok) return fail(`parse: ${parsed.reason}`);
  for (const issue of parsed.issues) log(`streams: ${pub.id} item ${issue.index} dropped (${issue.reason})`);
  if (parsed.withheld > 0) log(`streams: ${pub.id} ${parsed.withheld} item(s) withheld by guards`);
  await store.put<StreamData>(dataKey(pub.id), {
    schemaVersion: SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    data: { items: parsed.items, etag: outcome.etag, lastModified: outcome.lastModified },
  });
  await succeed();
  return "updated";
}

export type StreamView =
  | { publication: Publication; status: "unavailable" }
  | { publication: Publication; status: "fresh" | "stale"; fetchedAt: string; items: StreamItem[] };

/** What a page may show for one publication, read from the persisted snapshot only. */
export async function readPublication(pub: Publication, deps: Pick<Deps, "store" | "now"> & { config?: StreamsConfig } = {}): Promise<StreamView> {
  const store = deps.store ?? getSnapshotStore("read");
  const now = (deps.now ?? (() => new Date()))();
  let snap;
  try {
    snap = await store.get<StreamData>(dataKey(pub.id));
  } catch (err) {
    // A read failure shows "unavailable"; it is logged, never swallowed.
    const e = err as { name?: string; code?: string };
    console.error(`snapshots: read failed key=${dataKey(pub.id)} error=${[e?.name ?? "Error", e?.code].filter(Boolean).join(":")}`);
    snap = null;
  }
  if (!snap) return { publication: pub, status: "unavailable" };
  const items = snap.data.items.filter((i) => !isWithdrawn(pub.id, i.guid, deps.config ?? STREAMS));
  const stale = now.getTime() - Date.parse(snap.fetchedAt) > STALE_AFTER_MS;
  return { publication: pub, status: stale ? "stale" : "fresh", fetchedAt: snap.fetchedAt, items };
}

export async function readAllPublications(deps: Pick<Deps, "store" | "now"> & { config?: StreamsConfig } = {}): Promise<StreamView[]> {
  return Promise.all(enabledPublications(deps.config).map((p) => readPublication(p, deps)));
}

/**
 * Refresh every enabled publication, for the scheduled job or
 * `npm run refresh`. Never called from a page. `UPSTREAM_REFRESH=off`
 * disables it. Each publication still honours the 15-minute floor and its
 * backoff, so an extra invocation is harmless.
 */
export async function refreshAll(deps: Deps = {}): Promise<Record<string, RefreshResult | "error">> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.error(m));
  if (env.UPSTREAM_REFRESH === "off") return {};
  const pubs = enabledPublications();
  const results = await Promise.allSettled(pubs.map((p) => refreshPublication(p, deps)));
  const out: Record<string, RefreshResult | "error"> = {};
  results.forEach((r, i) => {
    const id = (pubs[i] as Publication).id;
    if (r.status === "fulfilled") out[id] = r.value;
    else {
      const e = r.reason as { name?: string; code?: string };
      log(`streams: ${id} refresh threw error=${[e?.name ?? "Error", e?.code].filter(Boolean).join(":")}`);
      out[id] = "error";
    }
  });
  return out;
}
