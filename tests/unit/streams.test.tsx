import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StreamStatus } from "@/components/words";
import { FileSnapshotStore } from "@/lib/storage/file";
import { StreamsConfigSchema, type Publication, type StreamsConfig } from "@/lib/streams/config";
import { fetchFeed, MAX_FEED_BYTES, USER_AGENT } from "@/lib/streams/fetch";
import { parseFeed } from "@/lib/streams/parse";
import { readPublication, refreshPublication, REFRESH_FLOOR_MS, STALE_AFTER_MS } from "@/lib/streams/service";
import { htmlToText } from "@/lib/streams/text";

const fixture = (name: string) => readFileSync(join("tests/fixtures/feeds", name), "utf8");
const PUB: Publication = {
  id: "the-human-butterfly",
  name: "The Human Butterfly",
  home: "https://everydecimal.substack.com",
  feed: "https://everydecimal.substack.com/feed",
  enabled: true,
};
/** Synthetic custom-domain publication on a reserved example host. */
const CUSTOM: Publication = { ...PUB, home: "https://www.example.com", feed: "https://www.example.com/feed" };

describe("config (SS-1)", () => {
  it("ships two publications, Incentive Eyes disabled", async () => {
    const { STREAMS } = await import("@/lib/streams/config");
    expect(STREAMS.publications.map((p) => [p.id, p.enabled])).toEqual([
      ["the-human-butterfly", true],
      ["incentive-eyes", false],
    ]);
  });
  it("rejects unknown keys, http feeds, a feed on another host and withdrawals of unknown publications", () => {
    const base = { schemaVersion: 1, publications: [PUB], withdrawn: [] };
    expect(StreamsConfigSchema.safeParse(base).success).toBe(true);
    expect(StreamsConfigSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(StreamsConfigSchema.safeParse({ ...base, publications: [{ ...PUB, feed: "http://everydecimal.substack.com/feed" }] }).success).toBe(false);
    expect(StreamsConfigSchema.safeParse({ ...base, publications: [{ ...PUB, feed: "https://other.example.com/feed" }] }).success).toBe(false);
    expect(StreamsConfigSchema.safeParse({ ...base, withdrawn: [{ publication: "nope", guid: "x" }] }).success).toBe(false);
  });
  it("accepts a custom www host only with its feed at https://<www host>/feed (D3)", () => {
    const base = { schemaVersion: 1, withdrawn: [] };
    expect(StreamsConfigSchema.safeParse({ ...base, publications: [CUSTOM] }).success).toBe(true);
    for (const bad of [
      { ...CUSTOM, feed: "https://everydecimal.substack.com/feed" },
      { ...CUSTOM, feed: "https://www.example.com/rss" },
      { ...CUSTOM, feed: "https://www.example.com/feed/" },
      { ...CUSTOM, home: "https://www.example.com/blog", feed: "https://www.example.com/blog/feed" },
      { ...CUSTOM, home: "https://www.example.com:8443", feed: "https://www.example.com:8443/feed" },
    ]) {
      expect(StreamsConfigSchema.safeParse({ ...base, publications: [bad] }).success, bad.feed).toBe(false);
    }
  });
});

describe("custom publication host (D3)", () => {
  const xml = (links: string[]) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${links
      .map((l, i) => `<item><title>Synthetic ${i}</title><link>${l}</link><guid>g${i}</guid><pubDate>Tue, 0${i + 1} Sep 2026 12:00:00 GMT</pubDate></item>`)
      .join("")}</channel></rss>`;

  it("drops an item still on the old substack.com host once a custom host is configured", () => {
    const r = parseFeed(xml(["https://everydecimal.substack.com/p/old", "https://www.example.com/p/new"]), CUSTOM, {});
    if (!r.ok) throw new Error(r.reason);
    expect(r.items.map((i) => i.url)).toEqual(["https://www.example.com/p/new"]);
    expect(r.issues).toEqual([{ index: 0, reason: "link outside the publication" }]);
  });

  it("matches the host exactly: no bare apex, subdomain, port or look-alike", () => {
    const r = parseFeed(
      xml(["https://example.com/p/a", "https://evil.www.example.com/p/b", "https://www.example.com:8443/p/c", "https://www.example.com.evil.test/p/d"]),
      CUSTOM,
      {},
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.items).toEqual([]);
    expect(r.issues.map((i) => i.reason)).toEqual(Array(4).fill("link outside the publication"));
  });
});

describe("parsing (SS-3, SS-4, SS-9)", () => {
  it("keeps healthy items, drops malformed ones, and imports metadata only", () => {
    const r = parseFeed(fixture("valid.xml"), PUB, {});
    if (!r.ok) throw new Error(r.reason);
    expect(r.items.map((i) => i.title)).toEqual(["Synthetic post two", "Synthetic post one & a half"]);
    expect(r.issues.map((i) => i.reason).sort()).toEqual(
      ["duplicate identity", "invalid publication time", "link outside the publication", "link outside the publication", "missing title"].sort(),
    );
    const one = r.items[1];
    expect(one?.subtitle).toBe("Synthetic subtitle with ’quotes’ {props.leak}");
    expect(JSON.stringify(r.items)).not.toMatch(/<|onerror|<script|alert|Full body/);
    expect(Object.keys(one ?? {}).sort()).toEqual(["guid", "homeEligible", "key", "mentionsSuicide", "publication", "publishedAt", "subtitle", "title", "url"]);
  });

  it("tells a valid empty feed from a failure", () => {
    expect(parseFeed(fixture("empty.xml"), PUB, {})).toEqual({ ok: true, items: [], issues: [], withheld: 0 });
    expect(parseFeed(fixture("malformed.xml"), PUB, {}).ok).toBe(false);
    expect(parseFeed("<html><body>not rss</body></html>", PUB, {}).ok).toBe(false);
  });

  it("refuses document type declarations, so no entity can expand (XXE)", () => {
    const r = parseFeed(fixture("xxe.xml"), PUB, {});
    expect(r).toEqual({ ok: false, reason: "document type declarations are not accepted" });
  });

  it("withholds items carrying private identifiers, and keeps PBC mentions off Home", () => {
    const xml = fixture("valid.xml").replace("Synthetic post two", "Synthetic post two about Secret-Project");
    const r = parseFeed(xml, PUB, { PRIVATE_IDENTIFIERS: "secret project" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.withheld).toBe(1);
    expect(r.items.map((i) => i.title)).toEqual(["Synthetic post one & a half"]);
    const pbc = parseFeed(fixture("valid.xml").replace("Plain synthetic description.", "On becoming a PBC"), PUB, {});
    if (!pbc.ok) throw new Error(pbc.reason);
    expect(pbc.items.find((i) => i.title === "Synthetic post two")?.homeEligible).toBe(false);
  });

  it("flags a mention of suicide so the page carries the crisis block", () => {
    const r = parseFeed(fixture("valid.xml").replace("Plain synthetic description.", "On suicide and care"), PUB, {});
    if (!r.ok) throw new Error(r.reason);
    expect(r.items.find((i) => i.title === "Synthetic post two")?.mentionsSuicide).toBe(true);
  });

  it("strips markup and decodes entities into plain text", () => {
    expect(htmlToText("<p>a&nbsp;b</p><style>x{}</style>&lt;script&gt;&#0;")).toBe("a b script");
  });
});

function response(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "application/rss+xml", ...headers } });
}

describe("fetching (SS-2)", () => {
  it("sends an identifying user agent and conditional headers, and never follows redirects", async () => {
    let seen: RequestInit | undefined;
    await fetchFeed(PUB.feed, {
      etag: '"abc"',
      lastModified: "Tue, 01 Sep 2026 12:00:00 GMT",
      fetchImpl: async (_u, init) => {
        seen = init;
        return new Response(null, { status: 304 });
      },
    });
    const h = seen?.headers as Record<string, string>;
    expect(h["User-Agent"]).toBe(USER_AGENT);
    expect(h["If-None-Match"]).toBe('"abc"');
    expect(h["If-Modified-Since"]).toBe("Tue, 01 Sep 2026 12:00:00 GMT");
    expect(seen?.redirect).toBe("error");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a redirect as a failure and does not follow it (D3)", async () => {
    let calls = 0;
    const r = await fetchFeed(PUB.feed, {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 301, headers: { location: "https://www.example.com/feed" } });
      },
    });
    expect(r).toEqual({ kind: "error", reason: "status" });
    expect(calls).toBe(1);
  });

  it("reports timeouts, status errors, wrong types and oversize bodies", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => Promise.reject(timeout) })).toEqual({ kind: "error", reason: "timeout" });
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => new Response("x", { status: 503 }) })).toEqual({ kind: "error", reason: "status" });
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => new Response("x", { headers: { "content-type": "text/html" } }) })).toEqual({ kind: "error", reason: "content-type" });
    // A missing or empty content type is refused (D5).
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => new Response(new Blob(["<rss/>"]).stream(), { headers: {} }) })).toEqual({ kind: "error", reason: "content-type" });
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => new Response(new Blob(["<rss/>"]).stream(), { headers: { "content-type": "" } }) })).toEqual({ kind: "error", reason: "content-type" });
    const big = "x".repeat(MAX_FEED_BYTES + 1);
    expect(await fetchFeed(PUB.feed, { fetchImpl: async () => response(big) })).toEqual({ kind: "error", reason: "too-large" });
    expect(await fetchFeed(PUB.feed, { maxBytes: 10, fetchImpl: async () => new Response(new Blob(["x".repeat(50)]).stream(), { headers: { "content-type": "application/xml" } }) })).toEqual({ kind: "error", reason: "too-large" });
  });
});

describe("refresh and persistence (SS-5, SS-6)", () => {
  const t0 = new Date("2026-09-01T12:00:00Z");
  const store = () => new FileSnapshotStore(mkdtempSync(join(tmpdir(), "streams-")));
  const quiet = () => {};

  it("persists a projection that survives a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "streams-"));
    const result = await refreshPublication(PUB, { store: new FileSnapshotStore(dir), fetchImpl: async () => response(fixture("valid.xml")), now: () => t0, log: quiet, env: {} });
    expect(result).toBe("updated");
    const view = await readPublication(PUB, { store: new FileSnapshotStore(dir), now: () => t0 });
    expect(view.status).toBe("fresh");
    expect(view.status !== "unavailable" && view.items).toHaveLength(2);
  });

  it("never replaces the last good read with an error, and backs off", async () => {
    const s = store();
    let calls = 0;
    await refreshPublication(PUB, { store: s, fetchImpl: async () => response(fixture("valid.xml")), now: () => t0, log: quiet, env: {} });
    const failing = async () => {
      calls += 1;
      return new Response("down", { status: 500 });
    };
    const at = (ms: number) => () => new Date(t0.getTime() + ms);
    expect(await refreshPublication(PUB, { store: s, fetchImpl: failing, now: at(REFRESH_FLOOR_MS - 1), log: quiet })).toBe("skipped");
    expect(await refreshPublication(PUB, { store: s, fetchImpl: failing, now: at(REFRESH_FLOOR_MS), log: quiet })).toBe("failed");
    // Backoff: the next attempt waits at least one floor after the failure.
    expect(await refreshPublication(PUB, { store: s, fetchImpl: failing, now: at(REFRESH_FLOOR_MS * 2 - 1), log: quiet })).toBe("skipped");
    expect(await refreshPublication(PUB, { store: s, fetchImpl: failing, now: at(REFRESH_FLOOR_MS * 2), log: quiet })).toBe("failed");
    // Second failure doubles the wait.
    expect(await refreshPublication(PUB, { store: s, fetchImpl: failing, now: at(REFRESH_FLOOR_MS * 3), log: quiet })).toBe("skipped");
    expect(calls).toBe(2);
    const view = await readPublication(PUB, { store: s, now: at(REFRESH_FLOOR_MS * 3) });
    expect(view.status !== "unavailable" && view.items.length).toBe(2);
  });

  it("labels an old read as stale, and a never-read feed as unavailable", async () => {
    const s = store();
    expect((await readPublication(PUB, { store: s, now: () => t0 })).status).toBe("unavailable");
    await refreshPublication(PUB, { store: s, fetchImpl: async () => response(fixture("valid.xml")), now: () => t0, log: quiet, env: {} });
    expect((await readPublication(PUB, { store: s, now: () => new Date(t0.getTime() + STALE_AFTER_MS + 1) })).status).toBe("stale");
  });

  it("shares one fetch between concurrent readers", async () => {
    const s = store();
    let calls = 0;
    const slow = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return response(fixture("valid.xml"));
    };
    await Promise.all([1, 2, 3].map(() => refreshPublication(PUB, { store: s, fetchImpl: slow, now: () => t0, log: quiet, env: {} })));
    expect(calls).toBe(1);
  });

  it("treats 304 as current without refetching the body", async () => {
    const s = store();
    await refreshPublication(PUB, { store: s, fetchImpl: async () => response(fixture("valid.xml"), { etag: '"v1"' }), now: () => t0, log: quiet, env: {} });
    const later = new Date(t0.getTime() + REFRESH_FLOOR_MS);
    const logs: string[] = [];
    expect(await refreshPublication(PUB, { store: s, fetchImpl: async () => new Response(null, { status: 304 }), now: () => later, log: (m) => logs.push(m) }), logs.join()).toBe("not-modified");
    const view = await readPublication(PUB, { store: s, now: () => later });
    expect(view.status !== "unavailable" && view.fetchedAt).toBe(later.toISOString());
  });

  it("withdraws an item from every surface at once, independent of the provider", async () => {
    const s = store();
    await refreshPublication(PUB, { store: s, fetchImpl: async () => response(fixture("valid.xml")), now: () => t0, log: quiet, env: {} });
    const config: StreamsConfig = { schemaVersion: 1, publications: [PUB], withdrawn: [{ publication: PUB.id, guid: "synthetic-guid-two" }] };
    const view = await readPublication(PUB, { store: s, now: () => t0, config });
    expect(view.status !== "unavailable" && view.items.map((i) => i.guid)).toEqual(["https://everydecimal.substack.com/p/synthetic-post-one"]);
  });
});

describe("server-rendered stream states", () => {
  it("names each state in text, without color", () => {
    expect(renderToStaticMarkup(<StreamStatus view={{ publication: PUB, status: "unavailable" }} />)).toContain("Publication feed unavailable.");
    expect(renderToStaticMarkup(<StreamStatus view={{ publication: PUB, status: "fresh", fetchedAt: "2026-09-01T12:00:00Z", items: [] }} />)).toContain("No posts yet.");
    expect(renderToStaticMarkup(<StreamStatus view={{ publication: PUB, status: "stale", fetchedAt: "2026-09-01T12:00:00Z", items: [] }} />)).toContain("last read");
  });
  it("shows the time of a fresh read, so Home carries the snapshot time", () => {
    const item = { guid: "g", title: "Synthetic", link: "https://everydecimal.substack.com/p/s", publishedAt: "2026-09-01T00:00:00Z" } as never;
    const html = renderToStaticMarkup(<StreamStatus view={{ publication: PUB, status: "fresh", fetchedAt: "2026-09-01T12:00:00Z", items: [item] }} />);
    expect(html).toContain('data-stream-status="fresh"');
    expect(html).toContain('<time dateTime="2026-09-01T12:00:00Z">1 Sep 2026, 08:00 EDT</time>');
  });
});
