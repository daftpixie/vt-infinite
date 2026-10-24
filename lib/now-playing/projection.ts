import { z } from "zod";
import { runRules } from "@/guards/rules.mjs";
import type { Env } from "@/lib/flags";

/**
 * The public projection of Spotify's currently-playing response (PRD S-5,
 * S-6; ADR 0009). Only these fields survive: the track name, the artist
 * names, the album name, their open.spotify.com links, whether it is
 * playing, and the item type. Album art, device, progress, timestamps,
 * context, actions and everything else are dropped here, before anything
 * is cached. A podcast episode keeps nothing but the fact that it is one.
 *
 * Names are kept exactly as Spotify supplies them; React escapes them when
 * they render. They are never restyled, shortened or altered.
 */
export type Link = { name: string; url: string | null };
export type Track = { name: string; url: string | null; artists: Link[]; album: Link | null };

/** What the component shows. Each state is stated in words (S-6). */
export type NowPlayingView =
  | { state: "playing" | "paused"; track: Track | null }
  | { state: "podcast" }
  | { state: "nothing" }
  | { state: "not-sharing" }
  | { state: "unreachable" };

export type NowPlayingState = NowPlayingView["state"];
/** What a Spotify answer can project to; the other two states never come from Spotify's data. */
export type ProjectedView = Exclude<NowPlayingView, { state: "not-sharing" | "unreachable" }>;

/** Longest name shown; a longer one withholds the details rather than cutting them. */
export const MAX_NAME_CHARS = 300;
export const MAX_ARTISTS = 10;

/**
 * The same display checks the publication streams apply (lib/streams/parse.ts):
 * names never show a secret, a private identifier or a provider-looking ID.
 * Brand words are not applied: a song's title is the artist's words, not ours.
 */
export const WITHHOLD_RULES = ["secrets", "private-env-identifiers", "long-numeric-id", "pbc-status", "byline"];

const SPOTIFY_ID = "[0-9A-Za-z]{22}";
const LINK_PATTERNS = {
  track: new RegExp(`^https://open\\.spotify\\.com/track/${SPOTIFY_ID}$`),
  artist: new RegExp(`^https://open\\.spotify\\.com/artist/${SPOTIFY_ID}$`),
  album: new RegExp(`^https://open\\.spotify\\.com/album/${SPOTIFY_ID}$`),
} as const;

/** An open.spotify.com link of the right kind, or null (the name then shows without a link). */
function link(kind: keyof typeof LINK_PATTERNS, url: unknown): string | null {
  return typeof url === "string" && LINK_PATTERNS[kind].test(url) ? url : null;
}

const Urls = z.object({ spotify: z.unknown().optional() }).partial().nullable().optional();
const Named = z.object({ name: z.string(), external_urls: Urls });
const Body = z.object({
  is_playing: z.boolean().optional(),
  currently_playing_type: z.string().optional(),
  item: z
    .object({
      type: z.string().optional(),
      name: z.unknown().optional(),
      external_urls: Urls,
      artists: z.array(Named).optional(),
      album: Named.nullable().optional(),
    })
    .nullable()
    .optional(),
});

const ok = (s: string) => s.trim().length > 0 && Array.from(s).length <= MAX_NAME_CHARS;

export type ProjectDeps = { env?: Env; log?: (m: string) => void };

/** Project a 200 body. Anything unexpected is "nothing playing", never a guess. */
export function project(body: unknown, deps: ProjectDeps = {}): ProjectedView {
  const log = deps.log ?? ((m: string) => console.warn(m));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    log("now playing: Spotify response not understood; showing nothing playing");
    return { state: "nothing" };
  }
  const { is_playing, currently_playing_type: type, item } = parsed.data;
  if (type === "episode" || item?.type === "episode") return { state: "podcast" };

  const state = is_playing === true ? "playing" : "paused";
  if (!item || item.type !== "track" || (type !== undefined && type !== "track")) {
    // An ad or an unknown item: say whether something plays, show nothing about it.
    return is_playing === true ? { state: "playing", track: null } : { state: "nothing" };
  }
  return { state, track: projectTrack(item, deps.env ?? process.env, log) };
}

function projectTrack(item: z.infer<typeof Body>["item"] & object, env: Env, log: (m: string) => void): Track | null {
  const name = typeof item.name === "string" ? item.name : "";
  const artists = (item.artists ?? []).slice(0, MAX_ARTISTS).map((a) => ({ name: a.name, url: link("artist", a.external_urls?.spotify) }));
  const album = item.album ? { name: item.album.name, url: link("album", item.album.external_urls?.spotify) } : null;
  const names = [name, ...artists.map((a) => a.name), ...(album ? [album.name] : [])];
  if (!names.every(ok) || artists.length === 0) {
    log("now playing: track details withheld (missing or over-long name)");
    return null;
  }
  const rules = runRules(names.join("\n"), { target: "now-playing", scopes: ["repo"], env, only: WITHHOLD_RULES }).map((f) => f.rule);
  if (rules.length) {
    // Rule IDs only, never the text (PRD Q-9).
    log(`now playing: track details withheld (${[...new Set(rules)].join(", ")})`);
    return null;
  }
  return { name, url: link("track", item.external_urls?.spotify), artists, album };
}

/** Every name a view shows, for the crisis check (Q-1). */
export function shownNames(view: NowPlayingView): string[] {
  if ((view.state !== "playing" && view.state !== "paused") || !view.track) return [];
  const t = view.track;
  return [t.name, ...t.artists.map((a) => a.name), ...(t.album ? [t.album.name] : [])];
}
