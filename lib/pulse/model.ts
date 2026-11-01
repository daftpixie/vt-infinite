import { SITE_TIME_ZONE } from "@/lib/content/dates";

export const PULSE_API = "/api/pulse";
export const RECENT_FRESH_MS = 60_000;
export const HISTORY_FRESH_MS = 300_000;
export const HOUR_MS = 3_600_000;
export const WINDOW_MS = 24 * HOUR_MS;
export const REPORTING_TIME_ZONE = SITE_TIME_ZONE;

export const DEFINITIONS = {
  bpm: "BPM — Beats per minute: pageviews in the preceding 5 minutes divided by 5. A five-minute average.",
  rhythm: "Rhythm strip: stylized EKG-inspired traffic trace, with one motif per observed 1-hour bucket.",
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

/**
 * One schematic P/QRS/T-like glyph per elapsed-hour bucket, never per visit.
 * A = count / displayed peak × 49% of drawing height. Zero is
 * flat. Horizontal glyph positions are fixed drawing coordinates, not event
 * timestamps. The exact counts/time intervals remain in the native table.
 */
export function trafficWavePath(buckets: readonly Bucket[], width = 720, height = 144): string {
  const max = Math.max(1, ...buckets.map((b) => b.pageviews));
  const baseline = height * 0.65;
  const span = width / Math.max(1, buckets.length);
  const scale = Math.min(baseline, height - baseline) * 1.4;
  const f = (n: number) => n.toFixed(2);
  let d = `M0 ${f(baseline)}`;
  for (const [i, bucket] of buckets.entries()) {
    const x = i * span;
    if (bucket.pageviews === 0) { d += ` L${f(x + span)} ${f(baseline)}`; continue; }
    const a = bucket.pageviews / max * scale;
    const p = (fraction: number, amplitude = 0) => `${f(x + fraction * span)} ${f(baseline - amplitude * a)}`;
    d += ` L${p(0.12)} Q${p(0.2, 0.22)} ${p(0.28)} L${p(0.36)} L${p(0.42, -0.12)} L${p(0.5, 1)} L${p(0.58, -0.3)} L${p(0.64)} Q${p(0.76, 0.5)} ${p(0.9)} L${p(1)}`;
  }
  return d;
}
