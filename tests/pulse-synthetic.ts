import { DEFINITIONS, HOUR_MS, REPORTING_TIME_ZONE, WINDOW_MS, type History, type PulseResult, type Recent } from "@/lib/pulse/model";

/** Synthetic test input only. Never imported by app/, components/ or lib/. */
export function syntheticPulse(end = Date.UTC(2026, 9, 31, 12)): PulseResult {
  const iso = (at: number) => new Date(at).toISOString();
  const counts = [2, 1, 0, 4, 8, 3, 2, 1, 0, 0, 4, 5, 12, 3, 2, 6, 5, 2, 1, 0, 3, 4, 6, 2];
  const history: History = {
    start: iso(end - WINDOW_MS), end: iso(end), readAt: iso(end), bucketSeconds: 3600,
    buckets: counts.map((pageviews, i) => ({ start: iso(end - WINDOW_MS + i * HOUR_MS), end: iso(end - WINDOW_MS + (i + 1) * HOUR_MS), pageviews })),
    total: counts.reduce((a, b) => a + b, 0), peak: Math.max(...counts),
    sources: [{ label: "Direct / None", pageviews: 20 }, { label: "Google", pageviews: 10 }], sourcesSuppressed: true,
  };
  const recent: Recent = { start: iso(end - 300_000), end: iso(end), readAt: iso(end), pageviews: 7, bpm: 1.4 };
  return { status: "fresh", timezone: REPORTING_TIME_ZONE, servedAt: iso(end), recent: { status: "fresh", data: recent }, history: { status: "fresh", data: history }, definitions: DEFINITIONS };
}
