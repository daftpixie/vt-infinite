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

import { isEnabled, type Flag } from "./flags";

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
 * Spotify's official full logo, black and white (public/brand/third-party/spotify,
 * ADR 0009, "Logo"). Byte for byte as Spotify supplies it.
 */
export const SPOTIFY_LOGOS = {
  black: "/brand/third-party/spotify/Full_Logo_Black_RGB.svg",
  white: "/brand/third-party/spotify/Full_Logo_White_RGB.svg",
} as const;

/**
 * Landing paths that answer only while their feature flag is on (ADR 0009).
 * Off, the proxy denies them, the route or a landing build answers 404 too,
 * and nothing else under public/brand/third-party is ever served.
 */
export const LANDING_FLAGGED: ReadonlyArray<{ path: string; flag: Flag }> = [
  { path: "/api/now-playing", flag: "nowPlaying" },
  { path: SPOTIFY_LOGOS.black, flag: "nowPlaying" },
  { path: SPOTIFY_LOGOS.white, flag: "nowPlaying" },
];
export const LANDING_FLAGGED_PATHS: readonly string[] = LANDING_FLAGGED.map((f) => f.path);

/** The flagged landing paths whose flag is on now. */
export function openFlaggedPaths(env: Env = process.env): string[] {
  return LANDING_FLAGGED.filter((f) => isEnabled(f.flag, env)).map((f) => f.path);
}

/**
 * Every path that answers in landing mode. Paths are compared after
 * lib/access.ts normalises them. The stacked lockup is inlined into `/`,
 * so the small mark (the favicon) is the only file served from public/brand.
 */
export const LANDING_PATHS: readonly string[] = [...LANDING_PAGES, "/robots.txt", "/sitemap.xml", "/brand/vt-infinite-mark-small.svg", ...LANDING_FLAGGED_PATHS];

/**
 * The font files app/globals.css (and the proxy's own 404 and 410 pages)
 * load. The only other files served from public/ in landing mode;
 * everything else there, the font licence included, answers 404.
 * tests/unit/landing-gate.test.ts checks this list against the stylesheet.
 */
export const LANDING_FONTS: readonly string[] = ["/fonts/JetBrainsMono-wght.woff2", "/fonts/JetBrainsMono-Italic-wght.woff2"];
