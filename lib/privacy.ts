import type { Env } from "./flags";
import { nowPlayingEnabled } from "./now-playing/config";

/**
 * The privacy notice served at /privacy in landing mode. Each version is
 * fixed once published; a change in what the site does gets a new version
 * (docs/adr/0008-landing-privacy-notice.md).
 *
 * "landing-2" adds "now playing" (docs/adr/0009-now-playing.md). It is served
 * only while NOW_PLAYING_ENABLED is "true", and "landing-1", unchanged,
 * otherwise, so the notice always matches what the page does.
 */
export const PRIVACY_NOTICE_VERSIONS = ["landing-1", "landing-2"] as const;
export type PrivacyNoticeVersion = (typeof PRIVACY_NOTICE_VERSIONS)[number];

/** The version the landing release serves now. */
export function privacyNoticeVersion(env: Env = process.env): PrivacyNoticeVersion {
  return nowPlayingEnabled(env) ? "landing-2" : "landing-1";
}

/** Vercel's privacy notice, linked from the hosting section. */
export const VERCEL_PRIVACY_URL = "https://vercel.com/legal/privacy-notice";
