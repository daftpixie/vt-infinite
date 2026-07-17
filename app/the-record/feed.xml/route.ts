import { SITE_URL } from "../../constants";
import { getRecordPosts } from "../../../lib/record";

export const dynamic = "force-static";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(date: string): string {
  // Date-only entries are pinned to noon UTC so time zones cannot shift the day.
  return new Date(date.length === 10 ? `${date}T12:00:00Z` : date).toUTCString();
}

export function GET() {
  const items = getRecordPosts()
    .map((post) => {
      const url = `${SITE_URL}/the-record/${post.slug}`;
      return [
        "    <item>",
        `      <title>${esc(post.title)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        `      <pubDate>${rfc822(post.date)}</pubDate>`,
        `      <dc:creator>${esc(post.author)}</dc:creator>`,
        `      <description>${esc(post.summary)}</description>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>VT Infinite — The Record</title>
    <link>${esc(`${SITE_URL}/the-record`)}</link>
    <description>The running record of what is actually being built. Vision lives on the other pages. State lives here.</description>
    <language>en</language>
    <atom:link href="${esc(`${SITE_URL}/the-record/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
