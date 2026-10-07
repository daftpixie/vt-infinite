/** Site scheduling time zone (PRD W-3). */
export const SITE_TIME_ZONE = "America/New_York";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** ISO 8601 with an explicit offset; a bare local time is ambiguous and refused. */
export function isIsoWithOffset(s: string): boolean {
  return ISO_WITH_OFFSET.test(s) && !Number.isNaN(Date.parse(s));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 Sep 2026" in the site time zone (brand §05 date style). */
export function formatDate(iso: string, timeZone = SITE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return `${get("day")} ${MONTHS[get("month") - 1]} ${get("year")}`;
}

/** "7 Oct 2026, 14:05 EDT": a read time, 24-hour clock, in the site time zone. */
export function formatDateTime(iso: string, timeZone = SITE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${formatDate(iso, timeZone)}, ${get("hour")}:${get("minute")} ${get("timeZoneName")}`;
}

/** Machine form for <time dateTime>. */
export function isoDate(iso: string): string {
  return new Date(iso).toISOString();
}
