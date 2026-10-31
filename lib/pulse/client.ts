import "server-only";
import { HOUR_MS, WINDOW_MS, type History, type Recent, SOURCE_LABELS } from "./model";

export const STATS_URL = "https://plausible.io/api/v2/query";
export const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;
export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;
type Credentials = { siteId: string; apiKey: string };
type Row = { dimensions: unknown[]; metrics: number[] };

/** Fixed error text only. Neither the upstream body nor its headers are public errors or logs. */
export class StatsUnavailable extends Error {
  constructor(readonly retryAfterMs = 60_000) { super("Aggregate read unavailable"); }
}

function retryAfter(value: string | null): number {
  const seconds = value && /^\d{1,6}$/.test(value) ? Number(value) : 300;
  return Math.min(86_400, Math.max(60, seconds)) * 1000;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new StatsUnavailable();
  const reader = response.body?.getReader();
  if (!reader) throw new StatsUnavailable();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) { await reader.cancel(); throw new StatsUnavailable(); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new StatsUnavailable(); }
}

/** Inclusive API end is one second before our exclusive end; every boundary is second-aligned. */
export function queryBody(siteId: string, paths: readonly string[], start: number, end: number, sources = false) {
  return {
    site_id: siteId,
    metrics: ["pageviews"],
    date_range: [new Date(start).toISOString(), new Date(end - 1000).toISOString()],
    filters: [["is", "event:page", paths]],
    dimensions: sources ? ["visit:source"] : [],
    include: { imports: false, ...(sources ? { total_rows: true } : {}) },
    ...(sources ? { pagination: { limit: 10000, offset: 0 } } : {}),
  };
}

async function query(c: Credentials, paths: readonly string[], start: number, end: number, sources: boolean, fetchImpl: FetchImpl, signal: AbortSignal): Promise<Row[]> {
  try {
    const response = await fetchImpl(STATS_URL, {
      method: "POST", redirect: "error", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(queryBody(c.siteId, paths, start, end, sources)),
    });
    if (response.status === 429) throw new StatsUnavailable(retryAfter(response.headers.get("retry-after")));
    if (!response.ok) throw new StatsUnavailable(response.status === 401 || response.status === 402 || response.status === 403 ? 3_600_000 : 60_000);
    const body = await boundedJson(response) as { results?: unknown; meta?: { total_rows?: unknown } } | null;
    if (!body || !Array.isArray(body.results) || body.results.length > 10000) throw new StatsUnavailable();
    const rows: Row[] = [];
    for (const row of body.results as Array<Partial<Row> | null>) {
      if (!row || !Array.isArray(row.dimensions) || row.dimensions.length !== (sources ? 1 : 0) || !Array.isArray(row.metrics) || row.metrics.length !== 1 || !Number.isSafeInteger(row.metrics[0]) || row.metrics[0]! < 0) throw new StatsUnavailable();
      if (sources && typeof row.dimensions[0] !== "string") throw new StatsUnavailable();
      rows.push({ dimensions: row.dimensions, metrics: row.metrics });
    }
    if (!sources && rows.length > 1) throw new StatsUnavailable();
    // Never publish a truncated source breakdown as complete.
    if (sources && (body.meta?.total_rows !== rows.length)) throw new StatsUnavailable();
    return rows;
  } catch (error) {
    if (error instanceof StatsUnavailable) throw error;
    throw new StatsUnavailable();
  }
}

export async function readRecent(c: Credentials, paths: readonly string[], end: number, fetchImpl: FetchImpl = fetch): Promise<Recent> {
  const start = end - 300_000;
  const rows = await query(c, paths, start, end, false, fetchImpl, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  const pageviews = rows[0]?.metrics[0] ?? 0;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), readAt: new Date().toISOString(), pageviews, bpm: pageviews / 5 };
}

/** Raw source values may be campaign text: only this closed vocabulary can reach a snapshot. */
export function projectSources(rows: readonly Row[]): Pick<History, "sources" | "sourcesSuppressed"> {
  const allowed = new Map<string, History["sources"][number]["label"]>([
    ["", "Direct / None"], ["Direct / None", "Direct / None"], ["Google", "Google"], ["Bing", "Bing"], ["DuckDuckGo", "DuckDuckGo"],
    ["GitHub", "GitHub"], ["github.com", "GitHub"], ["Substack", "Substack"], ["substack.com", "Substack"], ["Discord", "Discord"], ["discord.com", "Discord"],
    ["Twitter", "X"], ["X", "X"], ["Facebook", "Facebook"], ["LinkedIn", "LinkedIn"],
  ]);
  const totals = new Map<History["sources"][number]["label"], number>();
  for (const row of rows) {
    const name = allowed.get(String(row.dimensions[0]));
    const value = row.metrics[0]!;
    const label = name && value >= 5 ? name : "Other sources";
    totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const sources = SOURCE_LABELS.flatMap((label) => {
    const pageviews = totals.get(label) ?? 0;
    return pageviews >= 5 ? [{ label, pageviews }] : [];
  }).sort((a, b) => b.pageviews - a.pageviews);
  return { sources, sourcesSuppressed: (totals.get("Other sources") ?? 0) > 0 && (totals.get("Other sources") ?? 0) < 5 };
}

/**
 * 24 elapsed one-hour aggregates avoid ambiguous local timestamps at DST
 * transitions. Four concurrent reads at most. All counts and sources use
 * precisely the same half-open 24-hour window. 300 history queries/hour,
 * plus 60 recent queries/hour, below Plausible's default 600/hour budget.
 */
export async function readHistory(c: Credentials, paths: readonly string[], end: number, fetchImpl: FetchImpl = fetch): Promise<History> {
  const start = end - WINDOW_MS;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  const counts: number[] = new Array(24);
  let next = 0;
  let sourceRows: Row[] = [];
  let failure: unknown;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < 25 && !signal.aborted) {
      const i = next++;
      try {
        if (i === 24) sourceRows = await query(c, paths, start, end, true, fetchImpl, signal);
        else counts[i] = (await query(c, paths, start + i * HOUR_MS, start + (i + 1) * HOUR_MS, false, fetchImpl, signal))[0]?.metrics[0] ?? 0;
      } catch (error) { failure ??= error; controller.abort(); }
    }
  }));
  if (failure || signal.aborted || next !== 25 || counts.filter(Number.isSafeInteger).length !== 24) throw failure instanceof StatsUnavailable ? failure : new StatsUnavailable();
  const buckets = counts.map((pageviews, i) => ({ start: new Date(start + i * HOUR_MS).toISOString(), end: new Date(start + (i + 1) * HOUR_MS).toISOString(), pageviews }));
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), readAt: new Date().toISOString(), bucketSeconds: 3600, buckets, total: counts.reduce((a, b) => a + b, 0), peak: Math.max(...counts), ...projectSources(sourceRows) };
}
