/**
 * Synthetic Spotify answers for the now-playing tests. Every name, ID and
 * token here is invented for the tests; none is a real track, account or
 * credential.
 */
export const TRACK_URL = "https://open.spotify.com/track/SyntheticTrackId000001";
export const ARTIST_URL = "https://open.spotify.com/artist/SyntheticArtistId00001";
export const ARTIST2_URL = "https://open.spotify.com/artist/SyntheticArtistId00002";
export const ALBUM_URL = "https://open.spotify.com/album/SyntheticAlbumId000001";

/** A currently-playing body with every field Spotify might send that the projection must drop. */
export function trackBody(over: { is_playing?: boolean; name?: string; artists?: string[] } = {}) {
  const artists = over.artists ?? ["Synthetic Artist"];
  return {
    timestamp: 1_700_000_000_000,
    progress_ms: 61_234,
    is_playing: over.is_playing ?? true,
    currently_playing_type: "track",
    context: { type: "playlist", uri: "spotify:playlist:SyntheticListId0000001", external_urls: { spotify: "https://open.spotify.com/playlist/SyntheticListId0000001" } },
    device: { id: "synthetic-device", name: "Synthetic Device", volume_percent: 40 },
    actions: { disallows: { resuming: true } },
    item: {
      type: "track",
      id: "SyntheticTrackId000001",
      name: over.name ?? "Synthetic Track",
      uri: "spotify:track:SyntheticTrackId000001",
      duration_ms: 200_000,
      explicit: false,
      preview_url: "https://p.scdn.co/mp3-preview/synthetic",
      external_urls: { spotify: TRACK_URL },
      artists: artists.map((name, i) => ({ name, type: "artist", id: `a${i}`, external_urls: { spotify: i === 0 ? ARTIST_URL : ARTIST2_URL } })),
      album: {
        name: "Synthetic Album",
        release_date: "2000-01-01",
        images: [{ url: "https://i.scdn.co/image/synthetic", width: 640, height: 640 }],
        external_urls: { spotify: ALBUM_URL },
        artists: [{ name: "Synthetic Artist" }],
      },
    },
  };
}

/** An episode with details the projection must never keep. */
export function episodeBody() {
  return {
    is_playing: true,
    currently_playing_type: "episode",
    progress_ms: 10_000,
    item: {
      type: "episode",
      name: "Synthetic Episode Title",
      description: "Synthetic episode description",
      show: { name: "Synthetic Show", publisher: "Synthetic Publisher" },
      images: [{ url: "https://i.scdn.co/image/synthetic-episode" }],
      external_urls: { spotify: "https://open.spotify.com/episode/SyntheticEpisode000001" },
    },
  };
}

export const TOKEN_OK = { access_token: "synthetic-access-token", token_type: "Bearer", scope: "user-read-currently-playing", expires_in: 3600 };
