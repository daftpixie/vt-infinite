import { CrisisSupport } from "@/components/CrisisSupport";
import { ExternalLink } from "@/components/ExternalLink";
import { mentionsSuicide } from "@/lib/crisis";
import { SPOTIFY_LOGOS } from "@/lib/mode";
import { shownNames, type Link, type NowPlayingView } from "@/lib/now-playing/projection";
import { ageText, labelText, NOW_PLAYING_EMOJI, STATE_TEXT } from "@/lib/now-playing/view";

/** A name as Spotify supplies it, linked back to Spotify when the link is valid. */
function Name({ item }: { item: Link }) {
  return item.url ? <ExternalLink href={item.url}>{item.name}</ExternalLink> : <>{item.name}</>;
}

/**
 * Spotify's official full logo, from the site's own origin, byte for byte as
 * supplied. Both variants are in the page and CSS shows one: white on the
 * dark theme, black on the light, following the theme switch and the
 * system setting with no flash, since the theme is set before first paint.
 * The hidden one is display: none, so a screen reader hears "Spotify" once.
 * Width and clear space are set in app/globals.css.
 */
function SpotifyLogo() {
  return (
    <p className="spotify-logo">
      {/* eslint-disable-next-line @next/next/no-img-element -- the official files are served as they are, never optimised */}
      <img className="spotify-logo-white" src={SPOTIFY_LOGOS.white} alt="Spotify" width={120} height={33} />
      {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
      <img className="spotify-logo-black" src={SPOTIFY_LOGOS.black} alt="Spotify" width={120} height={33} />
    </p>
  );
}

/**
 * "Now playing" as it renders: on the server in full, and again in the
 * browser after each poll. The label is Matthew's, verbatim, with the emoji
 * hidden from screen readers. Every state is a sentence, not a color.
 * Spotify's metadata links back to Spotify, and Spotify's official full
 * logo attributes it (ADR 0009, "Logo").
 */
export function NowPlayingBody({ view, checkedAt, servedAt }: { view: NowPlayingView; checkedAt: number | null; servedAt: number }) {
  const track = (view.state === "playing" || view.state === "paused") && view.track ? view.track : null;
  const age = ageText(checkedAt, servedAt);
  return (
    <>
      <h2 id="now-playing-label" className="now-playing-label">
        {labelText()} <span aria-hidden="true">{NOW_PLAYING_EMOJI}</span>
      </h2>
      <p className="now-playing-state" data-state={view.state}>
        {STATE_TEXT[view.state]}
      </p>
      {track ? (
        <>
          <dl className="now-playing-track">
            <dt>Track</dt>
            <dd>
              <Name item={track} />
            </dd>
            <dt>{track.artists.length === 1 ? "Artist" : "Artists"}</dt>
            <dd>
              {track.artists.map((a, i) => (
                <span key={`${i}-${a.name}`}>
                  {i > 0 ? ", " : null}
                  <Name item={a} />
                </span>
              ))}
            </dd>
            {track.album ? (
              <>
                <dt>Album</dt>
                <dd>
                  <Name item={track.album} />
                </dd>
              </>
            ) : null}
          </dl>
          <SpotifyLogo />
        </>
      ) : null}
      {age ? <p className="now-playing-age">{age}</p> : null}
      {mentionsSuicide(...shownNames(view)) ? <CrisisSupport /> : null}
    </>
  );
}
