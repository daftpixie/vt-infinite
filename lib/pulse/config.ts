import { isEnabled, type Env } from "../flags";

/** Public installation configuration, never the Stats API credential. No provider ID is committed. */
export function scriptSource(env: Env = process.env): string | null {
  const value = env.PLAUSIBLE_SCRIPT_SRC ?? "";
  return /^https:\/\/plausible\.io\/js\/pa-[A-Za-z0-9]{12,64}\.js$/.test(value) ? value : null;
}

/** Public Events API domain, intentionally sent with pageviews; never the Stats API credential. */
export function measurementSiteId(env: Env = process.env): string | null {
  const value = env.PLAUSIBLE_SITE_ID ?? "";
  return value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value) ? value : null;
}

/** Build-time policy configuration, including Vercel builds where CI=1 is set by the platform. */
export function collectionConfigured(env: Env = process.env): boolean {
  return env.PLAUSIBLE_ENABLED === "true" && env.VERCEL_ENV === "production" && env.NODE_ENV === "production" && measurementSiteId(env) !== null;
}

export function collectionEnabled(env: Env = process.env): boolean {
  // CI=1 is also Vercel's production-build marker. It must not strip the
  // collector from prerendered public pages. Explicit test markers and the
  // browser's automation/opt-out guard prevent test-time collection.
  return collectionConfigured(env) && !env.VITEST && !env.PLAYWRIGHT_TEST;
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
