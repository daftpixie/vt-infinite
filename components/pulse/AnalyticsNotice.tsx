import { ExternalLink } from "@/components/ExternalLink";

/** Shared processing notice for both releases. Publication and collection have independent states. */
export function AnalyticsNotice({ collection, publication }: { collection: boolean; publication: boolean }) {
  return <>
    <h2>Site measurement</h2>
    {collection ? <>
      <p>This site uses Plausible for cookieless measurement of public pageviews. Your browser loads its script and sends pageview requests to Plausible. We remove query parameters and fragments from page URLs and reduce referral information to its originating site.</p>
      <p>Plausible processes request information, including IP address and browser information, to distinguish visits and visitors within a day using a daily identifier specific to this site and device. It cannot recognize the same visitor across days, devices or websites using that identifier. It keeps event and session records to calculate aggregate statistics; cookieless does not mean no data processing.</p>
      <p>We enable pageviews only. We do not enable outbound-link, download or form-submission capture, custom properties, persistent visitor identification, cross-site tracking, visitor histories, session replay or behavioral profiles. We do not send patient or member records. Admin and other private routes are excluded.</p>
    </> : <p>Collection of pageviews by Plausible is off in this deployment. Your browser does not load its script or send it pageview requests. This site sets no analytics cookies and adds no persistent visitor identifier.</p>}
    <h2>Public aggregates</h2>
    {publication ? <p>The Signal publishes selected aggregate pageview counts, hourly history and grouped referral sources from Plausible. It shows reporting windows, the reporting timezone, last successful reads and data status. Low-count sources are grouped or withheld; individual referral URLs and campaign values are not published. Previously collected aggregates can remain visible when new collection is off. Reading or refreshing the module does not send a pageview to Plausible.</p> : <p>Publication of The Signal is off. No cached statistics are published by this module. Turning publication off does not itself turn collection off.</p>}
    <p>Read <ExternalLink href="https://plausible.io/data-policy">Plausible’s data policy</ExternalLink> for its processing and retention details.</p>
  </>;
}
