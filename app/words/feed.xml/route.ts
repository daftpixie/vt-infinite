import { connection } from "next/server";
import { publishedEssays } from "@/lib/content/essays";
import { renderRss, rssResponse } from "@/lib/feeds/rss";
import { siteUrl } from "@/lib/site";

/** Published local essays only (PRD W-6). Stream posts are never presented as local articles. */
export async function GET() {
  await connection();
  const base = siteUrl();
  const items = publishedEssays().map((e) => ({
    title: e.title,
    link: `${base}/words/${e.slug}`,
    guid: `${base}/words/${e.slug}`,
    pubDate: new Date(e.publishAt),
    description: e.summary,
  }));
  return rssResponse(
    renderRss({ title: "VT Infinite — Words", link: `${base}/words`, selfUrl: `${base}/words/feed.xml`, description: "Essays published on vt-infinite.com." }, items),
  );
}
