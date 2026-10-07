import { describe, expect, it } from "vitest";
import type { Essay } from "@/lib/content/essays";
import type { StreamView } from "@/lib/streams/service";
import { buildWordsEntries, latestForHome } from "@/lib/words";

const pub = { id: "the-human-butterfly", name: "The Human Butterfly", home: "https://everydecimal.substack.com", feed: "https://everydecimal.substack.com/feed", enabled: true };
const item = (n: number, extra: Partial<{ url: string; homeEligible: boolean }> = {}) => ({
  key: `k${n}`,
  publication: pub.id,
  guid: `g${n}`,
  title: `Synthetic ${n}`,
  subtitle: null,
  url: extra.url ?? `https://everydecimal.substack.com/p/${n}`,
  publishedAt: `2026-09-0${n}T00:00:00.000Z`,
  mentionsSuicide: false,
  homeEligible: extra.homeEligible ?? true,
});
const essay = { slug: "m", title: "Mirror", publication: pub.id, publishAt: "2026-09-09T00:00:00Z", firstPublishedAt: "2026-09-01T00:00:00Z", firstPublishedUrl: "https://everydecimal.substack.com/p/1" } as Essay;

describe("Words and Home entries", () => {
  const streams: StreamView[] = [{ publication: pub, status: "fresh", fetchedAt: "2026-09-09T00:00:00Z", items: [item(1), item(2), item(3, { homeEligible: false }), item(4)] }];

  it("links a mirrored post locally and lists it once, newest first by first publication", () => {
    const entries = buildWordsEntries([essay], streams);
    expect(entries.map((e) => [e.title, e.local])).toEqual([
      ["Synthetic 4", false],
      ["Synthetic 3", false],
      ["Synthetic 2", false],
      ["Mirror", true],
    ]);
  });

  it("shows the three newest eligible posts on Home", () => {
    expect(latestForHome(buildWordsEntries([essay], streams)).map((e) => e.title)).toEqual(["Synthetic 4", "Synthetic 2", "Mirror"]);
  });

  it("shows nothing from an unavailable stream", () => {
    expect(buildWordsEntries([], [{ publication: pub, status: "unavailable" }])).toEqual([]);
  });

  it("keeps a local essay off Home when it fails the homepage claim checks, as a stream post would", () => {
    const claim = { slug: "c", title: "Synthetic essay", summary: "Synthetic summary: fund us today.", publication: "vt-infinite.com", publishAt: "2026-09-20T00:00:00Z" } as Essay;
    const plain = { slug: "p", title: "Synthetic plain essay", summary: "Synthetic summary.", publication: "vt-infinite.com", publishAt: "2026-09-19T00:00:00Z" } as Essay;
    const entries = buildWordsEntries([claim, plain], []);
    expect(entries.map((e) => [e.title, e.homeEligible])).toEqual([
      ["Synthetic essay", false],
      ["Synthetic plain essay", true],
    ]);
    expect(latestForHome(entries).map((e) => e.title)).toEqual(["Synthetic plain essay"]);
  });
});
