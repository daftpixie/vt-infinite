/**
 * Site mode. SITE_MODE unset or empty (or "full") is the full build,
 * unchanged. SITE_MODE=landing is the landing release: one page at `/`, the
 * privacy notice, robots and sitemap, and the favicon. Every other route
 * answers 404, in proxy.ts and in the route itself.
 *
 * Any other value is a typo, and a typo must not open the whole site: it is
 * treated as landing at request time, and the release check
 * (scripts/check-release.mjs) fails the build on it.
 */
export type SiteMode = "full" | "landing";

type Env = Readonly<Record<string, string | undefined>>;

const KNOWN = new Set(["", "full", "landing"]);

export function siteModeValueIsValid(env: Env = process.env): boolean {
  return KNOWN.has(env.SITE_MODE ?? "");
}

export function siteMode(env: Env = process.env): SiteMode {
  const value = env.SITE_MODE ?? "";
  return value === "" || value === "full" ? "full" : "landing";
}

export function isLanding(env: Env = process.env): boolean {
  return siteMode(env) === "landing";
}

/** The landing release's pages, in sitemap order. */
export const LANDING_PAGES = ["/", "/privacy"] as const;

/**
 * Every path that answers in landing mode. Paths are compared after
 * lib/access.ts normalises them. The stacked lockup is inlined into `/`,
 * so the small mark (the favicon) is the only file served from public/brand.
 */
export const LANDING_PATHS: readonly string[] = [...LANDING_PAGES, "/robots.txt", "/sitemap.xml", "/brand/vt-infinite-mark-small.svg"];
