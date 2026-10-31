import type { Env } from "./flags";
import { nowPlayingEnabled } from "./now-playing/config";
import { collectionEnabled, publicPulseEnabled } from "./pulse/config";

/**
 * The privacy notice served at /privacy in landing mode. Each version is
 * fixed once published; a change in what the site does gets a new version
 * (docs/adr/0008-landing-privacy-notice.md).
 *
 * "landing-2" adds "now playing" (docs/adr/0009-now-playing.md). It is served
 * only while NOW_PLAYING_ENABLED is "true", and "landing-1", unchanged,
 * otherwise, so the notice always matches what the page does.
 */
export const PRIVACY_NOTICE_VERSIONS = ["landing-1", "landing-2", "landing-signal-1", "landing-signal-2", "landing-signal-3", "landing-signal-4", "landing-signal-5", "landing-signal-6", "landing-signal-7", "landing-signal-8"] as const;
export type PrivacyNoticeVersion = (typeof PRIVACY_NOTICE_VERSIONS)[number];

/** The version the landing release serves now. */
export function privacyNoticeVersion(env: Env = process.env): PrivacyNoticeVersion {
  const bits = (nowPlayingEnabled(env) ? 1 : 0) + (collectionEnabled(env) ? 2 : 0) + (publicPulseEnabled(env) ? 4 : 0);
  return `landing-signal-${bits + 1}` as PrivacyNoticeVersion;
}

export function privacyFeatures(version: PrivacyNoticeVersion) {
  const bits = version === "landing-1" ? 0 : version === "landing-2" ? 1 : Number(version.slice("landing-signal-".length)) - 1;
  return { nowPlaying: Boolean(bits & 1), collection: Boolean(bits & 2), publication: Boolean(bits & 4) };
}

/** Vercel's privacy notice, linked from the hosting section. */
export const VERCEL_PRIVACY_URL = "https://vercel.com/legal/privacy-notice";
