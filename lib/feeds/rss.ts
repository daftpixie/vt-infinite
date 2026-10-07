import { mentionsSuicide, withoutCrisisBlock } from "@/lib/crisis";

export type FeedItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  description?: string;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * A feed reader cannot show the crisis block (PRD Q-1), so a description
 * that mentions suicide is left out, and an item whose title does is left
 * out entirely. The page keeps both, with the block.
 */
export function crisisSafeItems(items: readonly FeedItem[]): FeedItem[] {
  return items.filter((i) => !mentionsSuicide(i.title)).map((i) => ({ ...i, description: withoutCrisisBlock(i.description) }));
}

/** RSS 2.0 for published local content only (PRD W-6). */
export function renderRss(channel: { title: string; link: string; selfUrl: string; description: string }, items: readonly FeedItem[]): string {
  const body = crisisSafeItems(items)
    .map(
      (i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.link)}</link>
      <guid isPermaLink="false">${escapeXml(i.guid)}</guid>
      <pubDate>${i.pubDate.toUTCString()}</pubDate>${i.description ? `\n      <description>${escapeXml(i.description)}</description>` : ""}
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>en</language>
    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`;
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
