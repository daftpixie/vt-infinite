import "server-only";
import { z } from "zod";
import { HOUR_MS, WINDOW_MS, SOURCE_LABELS, type Recent, type History } from "./model";

const iso = z.iso.datetime();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const BucketSchema = z.object({ start: iso, end: iso, pageviews: count }).strict();
export const RecentSchema = z.object({ start: iso, end: iso, readAt: iso, pageviews: count, bpm: z.number().nonnegative() }).strict();
export const HistorySchema = z.object({
  start: iso, end: iso, readAt: iso,
  bucketSeconds: z.literal(3600),
  buckets: z.array(BucketSchema).length(24),
  total: count, peak: count,
  sources: z.array(z.object({ label: z.enum(SOURCE_LABELS), pageviews: count.min(5) }).strict()).max(SOURCE_LABELS.length),
  sourcesSuppressed: z.boolean(),
}).strict();

/** Revalidates persisted projections, including arithmetic and contiguous elapsed-time windows. */
export function validRecent(value: unknown): Recent | null {
  const r = RecentSchema.safeParse(value);
  if (!r.success) return null;
  const d = r.data;
  return Date.parse(d.end) - Date.parse(d.start) === 300_000 && d.bpm === d.pageviews / 5 && Date.parse(d.readAt) >= Date.parse(d.end) ? d : null;
}

export function validHistory(value: unknown): History | null {
  const r = HistorySchema.safeParse(value);
  if (!r.success) return null;
  const d = r.data;
  if (Date.parse(d.end) - Date.parse(d.start) !== WINDOW_MS || Date.parse(d.readAt) < Date.parse(d.end)) return null;
  for (const [i, b] of d.buckets.entries()) {
    if (Date.parse(b.start) !== Date.parse(d.start) + i * HOUR_MS || Date.parse(b.end) - Date.parse(b.start) !== HOUR_MS) return null;
  }
  if (d.total !== d.buckets.reduce((n, b) => n + b.pageviews, 0) || !Number.isSafeInteger(d.total) || d.peak !== Math.max(...d.buckets.map((b) => b.pageviews))) return null;
  if (new Set(d.sources.map((s) => s.label)).size !== d.sources.length || d.sources.reduce((n, s) => n + s.pageviews, 0) > d.total) return null;
  return d;
}

