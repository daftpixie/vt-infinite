import { CrisisSupport } from "@/components/CrisisSupport";
import { ExternalLink } from "@/components/ExternalLink";
import { Placeholder } from "@/components/Placeholder";
import { mentionsSuicide } from "@/lib/crisis";
import { shownNames, type Link, type NowPlayingView } from "@/lib/now-playing/projection";
import { ageText, labelText, NOW_PLAYING_EMOJI, STATE_TEXT } from "@/lib/now-playing/view";

/** A name as Spotify supplies it, linked back to Spotify when the link is valid. */
function Name({ item }: { item: Link }) {
  return item.url ? <ExternalLink href={item.url}>{item.name}</ExternalLink> : <>{item.name}</>;
}

/**
 * "Now playing" as it renders: on the server in full, and again in the
 * browser after each poll. The label is Matthew's, verbatim, with the emoji
 * hidden from screen readers. Every state is a sentence, not a color.
 * Spotify's metadata links back to Spotify; the logo its guidelines ask for
 * is a placeholder until Matthew supplies the official asset (ADR 0009), so
 * the release check holds the feature until then.
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
          <Placeholder id="spotifyLogo" />
        </>
      ) : null}
      {age ? <p className="now-playing-age">{age}</p> : null}
      {mentionsSuicide(...shownNames(view)) ? <CrisisSupport /> : null}
    </>
  );
}
