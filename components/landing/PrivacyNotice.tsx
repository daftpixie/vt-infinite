import { ExternalLink } from "@/components/ExternalLink";
import { LANDING } from "@/lib/landing";
import { PRIVACY_NOTICE_VERSION, VERCEL_PRIVACY_URL } from "@/lib/privacy";

/**
 * Privacy notice "landing-1": what the landing release actually does.
 * Every sentence that states a fact is listed with its source in
 * docs/adr/0008-landing-privacy-notice.md. Change the version when the
 * site changes what it does.
 */
export function PrivacyNotice() {
  return (
    <>
      <p>Version {PRIVACY_NOTICE_VERSION}</p>

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

      <h2>Links to other sites</h2>
      <p>The links to our publications go to Substack. The Discord link goes to Discord. When you follow one, you leave this site, and that service&rsquo;s own privacy rules apply.</p>
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
