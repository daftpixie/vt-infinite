import { ExternalLink } from "@/components/ExternalLink";
import { LANDING } from "@/lib/landing";
import { type PrivacyNoticeVersion, VERCEL_PRIVACY_URL } from "@/lib/privacy";

/**
 * Privacy notice "landing-1", or "landing-2" while "now playing" is on:
 * what the landing release actually does. Every sentence that states a
 * fact is listed with its source in docs/adr/0008-landing-privacy-notice.md
 * ("landing-1") and docs/adr/0009-now-playing.md (what "landing-2" adds).
 * Change the version when the site changes what it does.
 */
export function PrivacyNotice({ version }: { version: PrivacyNoticeVersion }) {
  const nowPlaying = version === "landing-2";
  return (
    <>
      <p>Version {version}</p>

      <h2>What this site collects</h2>
      <p>This site does not collect anything about you. It has no sign-up form, no comments and no accounts.</p>
      <p>It sets no cookies. It uses no analytics and no tracking. It loads nothing from other websites.</p>

      <h2>Your theme choice</h2>
      <p>If you pick a theme at the bottom of the page, your browser saves that choice on your device. It is not sent to us.</p>

      <h2>Hosting</h2>
      <p>This site is hosted by Vercel. To show you a page, your browser connects to Vercel&rsquo;s servers. Like any web server, they see your IP address and the page you ask for.</p>
      <p>Vercel keeps logs of requests to this site, such as the time, the page and the result.</p>
      <p>
        To learn how Vercel handles this information, read <ExternalLink href={VERCEL_PRIVACY_URL}>Vercel&rsquo;s privacy notice</ExternalLink>.
      </p>

      {nowPlaying ? (
        <>
          <h2>Spotify</h2>
          <p>The home page shows what Matthew is playing on Spotify. This site asks Spotify for it. Your browser does not contact Spotify.</p>
        </>
      ) : null}

      <h2>Links to other sites</h2>
      {nowPlaying ? (
        <p>The links to our publications go to Substack. The Discord link goes to Discord. Track links go to Spotify. When you follow one, you leave this site, and that service&rsquo;s own privacy rules apply.</p>
      ) : (
        <p>The links to our publications go to Substack. The Discord link goes to Discord. When you follow one, you leave this site, and that service&rsquo;s own privacy rules apply.</p>
      )}
      <p>This site asks your browser to tell them only that you came from vt-infinite.com, not which page.</p>

      <h2>Email updates</h2>
      <p>The email list is not open yet. Before it opens, this notice will be replaced with a new version. No email address will be collected before then.</p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${LANDING.contactEmail}`}>{LANDING.contactEmail}</a>.
      </p>
    </>
  );
}
