import { renderRss, rssResponse } from "@/lib/feeds/rss";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Kept at its old path (PRD DN-6). Only entries deliberately published in
 * the new system appear; none are published yet.
 */
export function GET() {
  const base = siteUrl();
  return rssResponse(
    renderRss(
      { title: "VT Infinite — The Record", link: `${base}/the-record`, selfUrl: `${base}/the-record/feed.xml`, description: "The build log of VT Infinite." },
      [],
    ),
  );
}
