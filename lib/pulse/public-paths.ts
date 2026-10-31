import { publishedEssays } from "@/lib/content/essays";
import { publishedRecord } from "@/lib/content/record";
import { isEnabled, type Env } from "@/lib/flags";
import { isLanding } from "@/lib/mode";
import { ROUTES } from "@/lib/routes";

/** Exact published page paths only. Never admin, APIs, unknown slugs or gated private features. */
export function publicMeasurementPaths(env: Env = process.env): string[] {
  if (isLanding(env)) return ["/", "/privacy"];
  return [...new Set([
    ...ROUTES.filter((r) => r.kind === "page" && r.status === 200).map((r) => r.path),
    ...publishedEssays().map((e) => `/words/${e.slug}`),
    ...publishedRecord().map((e) => `/the-record/${e.slug}`),
    ...(isEnabled("plan", env) ? ["/plan/onerhythm"] : []),
  ])].sort();
}

/** Both releases' public pages, for one consistent Stats API population across a mode switch. */
export function aggregatePaths(env: Env = process.env): string[] {
  return [...new Set([...publicMeasurementPaths({ ...env, SITE_MODE: "full" }), "/privacy"])].sort();
}
