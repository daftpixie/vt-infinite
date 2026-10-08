import { connection } from "next/server";
import { publishedRecord } from "@/lib/content/record";
import { renderRss, rssResponse } from "@/lib/feeds/rss";
import { siteUrl } from "@/lib/site";
import { landingNotFound } from "@/lib/mode-gate";

/**
 * Kept at its old path (PRD DN-6). Only entries deliberately published in
 * the new system appear. A republished historical entry keeps its original
 * GUID, so subscribers do not see it twice.
 */
export async function GET() {
  const landing = landingNotFound();
  if (landing) return landing;
  await connection();
  const base = siteUrl();
  const items = publishedRecord().map((e) => ({
    title: e.title,
    link: `${base}/the-record/${e.slug}`,
    guid: e.republication?.legacyGuid ?? `${base}/the-record/${e.slug}`,
    pubDate: new Date(e.republication?.originalPublishedAt ?? e.publishAt),
    description: e.summary,
  }));
  return rssResponse(
    renderRss(
      { title: "VT Infinite — The Record", link: `${base}/the-record`, selfUrl: `${base}/the-record/feed.xml`, description: "The build log of VT Infinite." },
      items,
    ),
  );
}
