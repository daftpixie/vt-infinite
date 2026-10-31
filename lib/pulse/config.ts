import { isEnabled, type Env } from "../flags";

/** Public installation configuration, never the Stats API credential. No provider ID is committed. */
export function scriptSource(env: Env = process.env): string | null {
  const value = env.PLAUSIBLE_SCRIPT_SRC ?? "";
  return /^https:\/\/plausible\.io\/js\/pa-[A-Za-z0-9]{12,64}\.js$/.test(value) ? value : null;
}

export function collectionRequested(env: Env = process.env): boolean {
  return env.PLAUSIBLE_ENABLED === "true" && env.VERCEL_ENV === "production" && env.NODE_ENV === "production" && !env.CI && !env.VITEST && !env.PLAYWRIGHT_TEST;
}

/**
 * ADR 0011: the currently supplied v37 script sends engagement outside
 * transformRequest. Pageview-only collection cannot yet be guaranteed.
 * Remove this hold only with a provider fix and a transport-level test.
 */
export const PAGEVIEW_ONLY_SCRIPT_VERIFIED: boolean = false;

export function collectionEnabled(env: Env = process.env): boolean {
  return PAGEVIEW_ONLY_SCRIPT_VERIFIED && collectionRequested(env) && scriptSource(env) !== null;
}

export function publicPulseEnabled(env: Env = process.env): boolean {
  return isEnabled("publicPulse", env);
}

export function statsCredentials(env: Env = process.env): { siteId: string; apiKey: string } | null {
  const siteId = env.PLAUSIBLE_SITE_ID ?? "";
  const apiKey = env.PLAUSIBLE_API_KEY ?? "";
  if (!siteId || siteId.length > 253 || /[\s/?#@]/.test(siteId) || !apiKey || /[\r\n]/.test(apiKey)) return null;
  return { siteId, apiKey };
}
