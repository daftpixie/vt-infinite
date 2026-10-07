import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EssayArticle } from "@/components/essay";
import { RecordArticle } from "@/components/record";
import type { Essay } from "@/lib/content/essays";
import { parseMdx } from "@/lib/content/mdx";
import type { RecordEntry } from "@/lib/content/record";
import { CRISIS_SUPPORT_TEXT, documentTitle, NEUTRAL_TITLES } from "@/lib/crisis";

// A4: the <title> element cannot carry the crisis block, so a title that
// mentions suicide is replaced there by a neutral form; the page keeps the
// real title beside the block. Synthetic content only.
const MENTION = "Synthetic title about suicide";

const essay = (title: string): Essay => ({
  title,
  summary: "Synthetic summary.",
  slug: "synthetic",
  author: "Matthew J Adams",
  publication: "vt-infinite.com",
  publishAt: "2026-09-03T09:00:00-04:00",
  updatedAt: "2026-09-03T09:00:00-04:00",
  tree: parseMdx("Synthetic body."),
});

const entry = (title: string): RecordEntry => ({
  title,
  slug: "synthetic",
  summary: "Synthetic summary.",
  publishAt: "2026-09-05T09:00:00-04:00",
  updatedAt: "2026-09-05T09:00:00-04:00",
  decidedBy: "Synthetic decider",
  evidence: [{ label: "Synthetic evidence", url: "https://example.com/e", date: "2026-09-04T09:00:00-04:00" }],
  open: "Synthetic open item.",
  tree: parseMdx("Synthetic body."),
});

const current = vi.hoisted(() => ({ essay: null as unknown, entry: null as unknown }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/content/essays", async (orig) => ({ ...(await orig<object>()), findEssay: () => current.essay }));
vi.mock("@/lib/content/record", async (orig) => ({ ...(await orig<object>()), findRecord: () => current.entry }));

const params = Promise.resolve({ slug: "synthetic" });

describe("document titles (A4)", () => {
  it("documentTitle keeps an ordinary title and neutralises a mention", () => {
    expect(documentTitle("Synthetic", "essay")).toBe("Synthetic");
    expect(documentTitle(MENTION, "essay")).toEqual({ absolute: "Essay · Matthew J Adams" });
    expect(documentTitle("On Suicidal thoughts", "record")).toEqual({ absolute: "Record entry · VT ∞" });
  });

  it("essay: the page's metadata uses the neutral title; the page keeps the real one beside the block", async () => {
    const { generateMetadata } = await import("@/app/words/[slug]/page");
    current.essay = essay("Synthetic ordinary title");
    expect((await generateMetadata({ params })).title).toBe("Synthetic ordinary title");
    current.essay = essay(MENTION);
    const meta = await generateMetadata({ params });
    expect(meta.title).toEqual({ absolute: NEUTRAL_TITLES.essay });
    expect(JSON.stringify(meta)).not.toMatch(/suicid/i);
    const html = renderToStaticMarkup(<EssayArticle essay={essay(MENTION)} />);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${MENTION}</h1>[\\s\\S]*</header><aside[^>]*data-crisis-support`));
    expect(html).toContain(CRISIS_SUPPORT_TEXT);
  });

  it("Record entry: the page's metadata uses the neutral title; the page keeps the real one beside the block", async () => {
    const { generateMetadata } = await import("@/app/the-record/[slug]/page");
    current.entry = entry("Synthetic ordinary entry");
    expect((await generateMetadata({ params })).title).toBe("Synthetic ordinary entry");
    current.entry = entry(MENTION);
    const meta = await generateMetadata({ params });
    expect(meta.title).toEqual({ absolute: NEUTRAL_TITLES.record });
    expect(JSON.stringify(meta)).not.toMatch(/suicid/i);
    const html = renderToStaticMarkup(<RecordArticle entry={entry(MENTION)} />);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${MENTION}</h1>[\\s\\S]*</header><aside[^>]*data-crisis-support`));
    expect(html).toContain(CRISIS_SUPPORT_TEXT);
  });
});
