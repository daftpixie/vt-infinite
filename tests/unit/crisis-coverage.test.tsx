import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EssayArticle } from "@/components/essay";
import { RecordArticle, RecordList } from "@/components/record";
import { WordsList } from "@/components/words";
import type { Essay } from "@/lib/content/essays";
import { parseMdx } from "@/lib/content/mdx";
import type { RecordEntry } from "@/lib/content/record";
import { CRISIS_SUPPORT_TEXT, mentionsSuicide, withoutCrisisBlock } from "@/lib/crisis";
import { renderRss } from "@/lib/feeds/rss";
import type { Publication } from "@/lib/streams/config";
import { parseFeed } from "@/lib/streams/parse";
import { buildWordsEntries } from "@/lib/words";

// Every rendered or exported field is checked for a mention of suicide; the
// verbatim crisis block renders wherever that text renders, and surfaces that
// cannot carry it (meta descriptions, feeds) leave the text out (PRD Q-1).
const MENTION = "Synthetic text about suicide";
const BLOCK = 'data-crisis-support=""';
const blocks = (html: string) => html.split(BLOCK).length - 1;

const essay = (over: Partial<Essay> = {}): Essay => ({
  title: "Synthetic essay",
  summary: "Synthetic summary.",
  slug: "s",
  author: "Matthew J Adams",
  publication: "vt-infinite.com",
  publishAt: "2026-09-03T09:00:00-04:00",
  updatedAt: "2026-09-03T09:00:00-04:00",
  tree: parseMdx("Synthetic body."),
  ...over,
});

const entry = (over: Partial<RecordEntry> = {}): RecordEntry => ({
  title: "Synthetic entry",
  slug: "e",
  summary: "Synthetic summary.",
  publishAt: "2026-09-05T09:00:00-04:00",
  updatedAt: "2026-09-05T09:00:00-04:00",
  decidedBy: "Synthetic decider",
  evidence: [{ label: "Synthetic evidence", url: "https://example.com/e", date: "2026-09-04T09:00:00-04:00" }],
  open: "Synthetic open item.",
  tree: parseMdx("Synthetic body."),
  ...over,
});

const feed = (items: Array<{ title: string; description?: string }>) =>
  renderRss(
    { title: "t", link: "https://example.com", selfUrl: "https://example.com/feed.xml", description: "d" },
    items.map((i, n) => ({ ...i, link: `https://example.com/${n}`, guid: `g${n}`, pubDate: new Date("2026-09-01T00:00:00Z") })),
  );

describe("mentionsSuicide and withoutCrisisBlock", () => {
  it("detect any form of the word and leave other text alone", () => {
    expect(mentionsSuicide(null, undefined, "Synthetic", "on Suicidal ideation")).toBe(true);
    expect(mentionsSuicide("Synthetic", null)).toBe(false);
    expect(withoutCrisisBlock(MENTION)).toBeUndefined();
    expect(withoutCrisisBlock("Synthetic summary.")).toBe("Synthetic summary.");
  });
  it("the block carries the verbatim wording", () => {
    expect(renderToStaticMarkup(<EssayArticle essay={essay({ title: MENTION })} />)).toContain(CRISIS_SUPPORT_TEXT);
  });
});

describe("Record entry fields", () => {
  it("no block when no field mentions suicide", () => {
    expect(blocks(renderToStaticMarkup(<RecordArticle entry={entry()} />))).toBe(0);
    expect(blocks(renderToStaticMarkup(<RecordList entries={[entry()]} />))).toBe(0);
  });
  it("title: block under the header on the entry and on the index; left out of feeds", () => {
    const html = renderToStaticMarkup(<RecordArticle entry={entry({ title: MENTION })} />);
    expect(html).toMatch(new RegExp(`</header><aside[^>]*${BLOCK}`));
    expect(blocks(renderToStaticMarkup(<RecordList entries={[entry({ title: MENTION })]} />))).toBe(1);
    const xml = feed([{ title: MENTION }, { title: "Synthetic kept" }]);
    expect(xml).not.toMatch(/suicid/i);
    expect(xml).toContain("Synthetic kept");
  });
  it("summary: block on the index; left out of the meta description and feed description", () => {
    expect(blocks(renderToStaticMarkup(<RecordList entries={[entry(), entry({ slug: "f", summary: MENTION })]} />))).toBe(1);
    expect(withoutCrisisBlock(entry({ summary: MENTION }).summary)).toBeUndefined();
    const xml = feed([{ title: "Synthetic entry", description: MENTION }]);
    expect(xml).toContain("<title>Synthetic entry</title>");
    expect(xml).not.toContain("<description>Synthetic text");
  });
  it("body: the loader requires the body to place the block, and it renders", () => {
    const html = renderToStaticMarkup(<RecordArticle entry={entry({ tree: parseMdx(`${MENTION}.\n\n<CrisisSupport />`) })} />);
    expect(blocks(html)).toBe(1);
  });
  it("open: block after what is still open", () => {
    const html = renderToStaticMarkup(<RecordArticle entry={entry({ open: MENTION })} />);
    expect(html).toMatch(new RegExp(`<p>${MENTION}</p><aside[^>]*${BLOCK}`));
    expect(blocks(html)).toBe(1);
  });
  it("decidedBy: block after the decision section", () => {
    const html = renderToStaticMarkup(<RecordArticle entry={entry({ decidedBy: MENTION })} />);
    expect(html.indexOf(BLOCK)).toBeGreaterThan(html.indexOf(MENTION));
    expect(blocks(html)).toBe(1);
  });
});

describe("essay fields", () => {
  it("no block when no field mentions suicide", () => {
    expect(blocks(renderToStaticMarkup(<EssayArticle essay={essay()} />))).toBe(0);
    expect(blocks(renderToStaticMarkup(<WordsList entries={buildWordsEntries([essay()], [])} />))).toBe(0);
  });
  it("title: block under the header and after any list showing it; left out of feeds", () => {
    expect(renderToStaticMarkup(<EssayArticle essay={essay({ title: MENTION })} />)).toMatch(new RegExp(`</header><aside[^>]*${BLOCK}`));
    expect(blocks(renderToStaticMarkup(<WordsList entries={buildWordsEntries([essay({ title: MENTION })], [])} />))).toBe(1);
    expect(feed([{ title: MENTION, description: "Synthetic summary." }])).not.toContain("<item>");
  });
  it("subtitle: block under the header and after any list showing it", () => {
    expect(renderToStaticMarkup(<EssayArticle essay={essay({ subtitle: MENTION })} />)).toMatch(new RegExp(`</header><aside[^>]*${BLOCK}`));
    expect(blocks(renderToStaticMarkup(<WordsList entries={buildWordsEntries([essay({ subtitle: MENTION })], [])} />))).toBe(1);
  });
  it("summary: left out of the meta description and the feed description", () => {
    expect(withoutCrisisBlock(essay({ summary: MENTION }).summary)).toBeUndefined();
    const xml = feed([{ title: "Synthetic essay", description: MENTION }]);
    expect(xml).toContain("<item>");
    expect(xml).not.toMatch(/suicid/i);
  });
  it("body: the loader requires the body to place the block, and it renders once", () => {
    const html = renderToStaticMarkup(<EssayArticle essay={essay({ tree: parseMdx(`${MENTION}.\n\n<CrisisSupport />`) })} />);
    expect(blocks(html)).toBe(1);
  });
});

describe("stream fields", () => {
  const pub: Publication = { id: "the-human-butterfly", name: "The Human Butterfly", home: "https://everydecimal.substack.com", feed: "https://everydecimal.substack.com/feed", enabled: true };
  const xml = (title: string, description: string) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>${title}</title><link>https://everydecimal.substack.com/p/x</link><guid>g</guid><pubDate>Tue, 01 Sep 2026 12:00:00 GMT</pubDate><description>${description}</description></item></channel></rss>`;
  const render = (title: string, description: string) => {
    const r = parseFeed(xml(title, description), pub, {});
    if (!r.ok) throw new Error(r.reason);
    return renderToStaticMarkup(<WordsList entries={buildWordsEntries([], [{ publication: pub, status: "fresh", fetchedAt: "2026-09-02T00:00:00Z", items: r.items }])} />);
  };
  it("no block when neither field mentions suicide", () => {
    expect(blocks(render("Synthetic post", "Synthetic description"))).toBe(0);
  });
  it("title: block after the list", () => {
    expect(blocks(render(MENTION, "Synthetic description"))).toBe(1);
  });
  it("description: block after the list", () => {
    expect(blocks(render("Synthetic post", MENTION))).toBe(1);
  });
});
