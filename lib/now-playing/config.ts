import { isEnabled, type Env } from "@/lib/flags";

/**
 * Configuration for "now playing" (PRD S-1 to S-8; ADR 0009). Everything is
 * read from the host's environment per request; nothing here is shipped to
 * the browser. Environment variable names only: the values live in Vercel
 * (Production, Sensitive) and nowhere else (docs/ops/now-playing.md).
 */
export const NOW_PLAYING_ENV = {
  sharing: "NOW_PLAYING_SHARING",
  clientId: "SPOTIFY_CLIENT_ID",
  clientSecret: "SPOTIFY_CLIENT_SECRET",
  refreshToken: "SPOTIFY_REFRESH_TOKEN",
  authorizedAt: "SPOTIFY_AUTHORIZED_AT",
} as const;

/** NOW_PLAYING_ENABLED, exactly "true" (lib/flags.ts). Off: the page is unchanged and the API answers 404. */
export function nowPlayingEnabled(env: Env = process.env): boolean {
  return isEnabled("nowPlaying", env);
}

/**
 * Sharing is on when NOW_PLAYING_SHARING is unset, empty or "on" (Matthew,
 * 24 Oct 2026: unset means sharing). Any other value, "off" included, pauses
 * it: the page says "Not sharing right now" and nothing asks Spotify. A typo
 * pauses rather than shares.
 */
export function sharingOn(env: Env = process.env): boolean {
  const v = env[NOW_PLAYING_ENV.sharing] ?? "";
  return v === "" || v === "on";
}

export type Credentials = { clientId: string; clientSecret: string; refreshToken: string; authorizedAt: Date | null };

/**
 * The founder's Spotify credentials, or null when any is missing. On Vercel
 * they are read in Production only: a preview deployment never uses them,
 * even if a variable is set there by mistake.
 */
export function readCredentials(env: Env = process.env): Credentials | null {
  if (env.VERCEL && env.VERCEL_ENV !== "production") return null;
  const clientId = env[NOW_PLAYING_ENV.clientId] ?? "";
  const clientSecret = env[NOW_PLAYING_ENV.clientSecret] ?? "";
  const refreshToken = env[NOW_PLAYING_ENV.refreshToken] ?? "";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, authorizedAt: parseAuthorizedAt(env[NOW_PLAYING_ENV.authorizedAt]) };
}

/** SPOTIFY_AUTHORIZED_AT is an ISO date (2026-10-24) or date-time; anything else is ignored. */
export function parseAuthorizedAt(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Spotify's refresh tokens expire six months after the original
 * authorization, and refreshing does not extend them (ADR 0009, Step 0 c).
 * The estimate is the authorization date plus six calendar months.
 */
export function estimatedExpiry(authorizedAt: Date): Date {
  const d = new Date(authorizedAt.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 6);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** The warning window before the estimated expiry (S-4). */
export const EXPIRY_WARNING_DAYS = 30;

/** The log line for the warning window, or null outside it. The date is machine-form (YYYY-MM-DD). */
export function expiryWarning(authorizedAt: Date | null, now: Date): string | null {
  if (!authorizedAt) return null;
  const expiry = estimatedExpiry(authorizedAt);
  if (expiry.getTime() - now.getTime() > EXPIRY_WARNING_DAYS * 86_400_000) return null;
  return `Spotify needs reconnecting by ${expiry.toISOString().slice(0, 10)}`;
}
