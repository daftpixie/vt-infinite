/**
 * Words for "now playing", shared by the server render and the browser.
 * Browser-safe: no Node imports, no provider code.
 */
import type { NowPlayingState } from "./projection";

/** Matthew's label, verbatim (24 Oct 2026). The emoji is hidden from screen readers when it renders. */
export const NOW_PLAYING_LABEL = "What is Matty vibing to? ❤️";
export const NOW_PLAYING_EMOJI = "❤️";

/** The label without its emoji: what a screen reader hears. */
export function labelText(): string {
  return NOW_PLAYING_LABEL.slice(0, NOW_PLAYING_LABEL.length - NOW_PLAYING_EMOJI.length).trimEnd();
}

/** Each state in words, never color alone (PRD S-6, Q-7). The PRD's wording. */
export const STATE_TEXT: Record<NowPlayingState, string> = {
  playing: "Playing",
  paused: "Paused",
  nothing: "Nothing playing",
  "not-sharing": "Not sharing right now",
  podcast: "Listening to a podcast",
  unreachable: "Can’t reach Spotify right now",
};

/** The site's own API; the browser never contacts Spotify. */
export const NOW_PLAYING_API = "/api/now-playing";
/** Visible tabs ask the site every 30 s (S-3). */
export const NOW_PLAYING_POLL_MS = 30_000;
/** An answer older than this shows its age. */
export const SHOW_AGE_AFTER_MS = 60_000;

/** "As of 3 minutes ago", from the server's own clock; null while the answer is recent. */
export function ageText(checkedAt: number | null, servedAt: number): string | null {
  if (checkedAt === null) return null;
  const ms = servedAt - checkedAt;
  if (ms < SHOW_AGE_AFTER_MS) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `As of ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `As of ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}
