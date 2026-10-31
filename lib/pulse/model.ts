import { SITE_TIME_ZONE } from "@/lib/content/dates";

export const PULSE_API = "/api/pulse";
export const RECENT_FRESH_MS = 60_000;
export const HISTORY_FRESH_MS = 300_000;
export const HOUR_MS = 3_600_000;
export const WINDOW_MS = 24 * HOUR_MS;
export const REPORTING_TIME_ZONE = SITE_TIME_ZONE;

export const DEFINITIONS = {
  bpm: "BPM — Beats per minute: pageviews in the preceding 5 minutes divided by 5. A five-minute average.",
  rhythm: "Rhythm strip: observed pageviews over time, in consecutive 1-hour buckets. An EKG-inspired traffic trace.",
  peak: "Stress test: observed peak hourly pageviews over the preceding 24 hours. Traffic volume only; this is no server-capacity or load-test measurement.",
  output: "Cardiac output: total pageviews over the preceding 24 hours.",
  sources: "Circulation: aggregate referral-source pageview counts for the same 24-hour period. Attribution follows the source of the visit’s first pageview.",
} as const;

export const SOURCE_LABELS = ["Direct / None", "Google", "Bing", "DuckDuckGo", "GitHub", "Substack", "Discord", "X", "Facebook", "LinkedIn", "Other sources"] as const;
export type Bucket = { start: string; end: string; pageviews: number };
export type Recent = { start: string; end: string; readAt: string; pageviews: number; bpm: number };
export type History = {
  start: string; end: string; readAt: string; bucketSeconds: 3600;
  buckets: Bucket[]; total: number; peak: number;
  sources: Array<{ label: (typeof SOURCE_LABELS)[number]; pageviews: number }>;
  sourcesSuppressed: boolean;
};
export type DataStatus = "fresh" | "stale" | "unavailable";
export type Reading<T> = { status: DataStatus; data: T | null };
export type PulseResult = {
  status: "fresh" | "stale" | "unavailable";
  timezone: string;
  servedAt: string;
  recent: Reading<Recent>;
  history: Reading<History>;
  definitions: typeof DEFINITIONS;
};

export function ageReading<T extends { readAt: string }>(reading: Reading<T>, now: number, freshness: number): Reading<T> {
  if (!reading.data) return { status: "unavailable", data: null };
  if (reading.status === "stale" || now - Date.parse(reading.data.readAt) >= freshness) return { ...reading, status: "stale" };
  return reading;
}

export function restalePulse(result: PulseResult, now: number): PulseResult {
  const recent = ageReading(result.recent, now, RECENT_FRESH_MS);
  const history = ageReading(result.history, now, HISTORY_FRESH_MS);
  return { ...result, recent, history, status: overallStatus(recent, history) };
}

export function overallStatus(recent: Reading<Recent>, history: Reading<History>): DataStatus {
  return !recent.data && !history.data ? "unavailable" : recent.status === "fresh" && history.status === "fresh" ? "fresh" : "stale";
}

/** One point per observed bucket, equally spaced in elapsed time; amplitude uses the displayed maximum. No invented event times. */
export function tracePoints(buckets: readonly Bucket[], width = 720, height = 120): string {
  const max = Math.max(1, ...buckets.map((b) => b.pageviews));
  return buckets.map((b, i) => `${((i + 0.5) / buckets.length * width).toFixed(2)},${(height - 12 - b.pageviews / max * (height - 24)).toFixed(2)}`).join(" ");
}
