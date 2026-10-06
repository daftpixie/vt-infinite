import { renderRss, rssResponse } from "@/lib/feeds/rss";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Published local essays only. None are published yet, so the feed is empty. */
export function GET() {
  const base = siteUrl();
  return rssResponse(
    renderRss(
      { title: "VT Infinite — Words", link: `${base}/words`, selfUrl: `${base}/words/feed.xml`, description: "Essays first published on vt-infinite.com." },
      [],
    ),
  );
}
