import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, isIsoWithOffset } from "@/lib/content/dates";
import { contentDir, essayAssetPath, loadAllEssays, publishedEssays } from "@/lib/content/essays";
import { ContentError, isSafeHref, parseMdx } from "@/lib/content/mdx";
import { loadAllRecord, publishedRecord } from "@/lib/content/record";

const FIXTURES = "tests/fixtures/essays";
const NOW = new Date("2026-10-06T12:00:00Z");

type Fm = Record<string, unknown>;
const base: Fm = {
  title: "Synthetic",
  summary: "Synthetic summary.",
  slug: "s",
  author: "Matthew J Adams",
  publication: "vt-infinite.com",
  status: "published",
  finalSince: "2026-09-01T09:00:00-04:00",
  secondRead: { recordedAt: "2026-09-02T09:00:00-04:00" },
  publishAt: "2026-09-03T09:00:00-04:00",
  updatedAt: "2026-09-03T09:00:00-04:00",
};

function yaml(v: unknown, indent = ""): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Fm)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => (x && typeof x === "object" ? `${indent}${k}:\n${yaml(x, `${indent}  `)}` : `${indent}${k}: ${JSON.stringify(x)}`))
      .join("\n");
  }
  return `${indent}${JSON.stringify(v)}`;
}

function essayRoot(entries: Array<{ slug?: string; fm?: Fm; body?: string; raw?: string; files?: Record<string, string> }>): string {
  const root = mkdtempSync(join(tmpdir(), "essays-"));
  for (const e of entries) {
    const slug = e.slug ?? String(e.fm?.slug ?? "s");
    mkdirSync(join(root, slug, "assets"), { recursive: true });
    writeFileSync(join(root, slug, "index.mdx"), e.raw ?? `---\n${yaml({ ...base, slug, ...e.fm })}\n---\n\n${e.body ?? "Synthetic body."}\n`);
    for (const [name, content] of Object.entries(e.files ?? {})) writeFileSync(join(root, slug, name), content);
  }
  return root;
}

const fails = (entries: Parameters<typeof essayRoot>[0], pattern: RegExp) => expect(() => loadAllEssays(essayRoot(entries))).toThrow(pattern);

describe("essay schema (W-1, W-2)", () => {
  it("accepts a valid published essay", () => {
    expect(publishedEssays(NOW, essayRoot([{ fm: {} }])).map((e) => e.slug)).toEqual(["s"]);
  });
  it("rejects unknown, missing and duplicate keys", () => {
    fails([{ fm: { extra: 1 } }], /Unrecognized key/);
    fails([{ fm: { summary: undefined } }], /summary/);
    fails([{ raw: "---\ntitle: a\ntitle: b\n---\nx" }], /duplicate|unique/i);
  });
  it("requires the approved byline", () => {
    // Built from parts so the repository guard does not flag this test.
    fails([{ fm: { author: ["Matthew J", "Adams"].join(". ") } }], /author/);
  });
  it("needs a private hold reason for held pieces, and never outputs it", () => {
    fails([{ fm: { status: "held" } }], /holdReason/);
    const root = essayRoot([{ fm: { status: "held", holdReason: "SECRET-REASON" } }, { slug: "p", fm: { slug: "p" } }]);
    expect(JSON.stringify(publishedEssays(NOW, root))).not.toContain("SECRET-REASON");
    expect(publishedEssays(NOW, root).map((e) => e.slug)).toEqual(["p"]);
  });
  it("keeps drafts, held and scheduled pieces out", () => {
    const root = essayRoot([
      { slug: "d", fm: { slug: "d", status: "draft" } },
      { slug: "f", fm: { slug: "f", finalSince: "2099-01-01T00:00:00Z", secondRead: { recordedAt: "2099-01-02T00:00:00Z" }, publishAt: "2099-01-03T00:00:00Z" } },
    ]);
    expect(publishedEssays(NOW, root)).toEqual([]);
  });
  it("rejects a slug that differs from its directory, and extra files", () => {
    fails([{ slug: "dir", fm: { slug: "other" } }], /does not match/);
    fails([{ fm: {}, files: { "notes.md": "x" } }], /one file per slug/);
  });
});

describe("48 elapsed hours (W-3)", () => {
  it("accepts exactly 48 hours across different offsets and refuses one second less", () => {
    const ok = { finalSince: "2026-09-01T09:00:00-04:00", secondRead: { recordedAt: "2026-09-02T00:00:00Z" }, publishAt: "2026-09-03T13:00:00Z" };
    expect(publishedEssays(NOW, essayRoot([{ fm: ok }]))).toHaveLength(1);
    fails([{ fm: { ...ok, publishAt: "2026-09-03T12:59:59Z" } }], /48 elapsed hours/);
  });
  it("counts elapsed time across a daylight-saving change, not calendar days", () => {
    // 2026-11-01 New York falls back: 09:00 EDT on 31 Oct to 09:00 EST on 2 Nov is 49 hours.
    const fm = { finalSince: "2026-10-31T09:00:00-04:00", secondRead: { recordedAt: "2026-11-01T09:00:00-05:00" }, publishAt: "2026-11-02T08:00:00-05:00" };
    expect(publishedEssays(new Date("2026-12-01T00:00:00Z"), essayRoot([{ fm }]))).toHaveLength(1);
  });
  it("requires timezone offsets", () => {
    fails([{ fm: { publishAt: "2026-09-03T09:00:00" } }], /offset/);
    fails([{ fm: { publishAt: "2026-09-03" } }], /offset/);
    expect(isIsoWithOffset("2026-09-03T09:00:00Z")).toBe(true);
  });
  it("needs the second read between final text and publication", () => {
    fails([{ fm: { secondRead: { recordedAt: "2026-08-01T00:00:00Z" } } }], /second read/);
    fails([{ fm: { secondRead: undefined } }], /secondRead/);
  });
});

describe("first publication (W-4)", () => {
  const mirror = { publication: "the-human-butterfly", firstPublishedUrl: "https://everydecimal.substack.com/p/x", firstPublishedAt: "2026-08-01T12:00:00Z" };
  it("accepts a mirror released after its first publication", () => {
    expect(publishedEssays(NOW, essayRoot([{ fm: mirror }]))).toHaveLength(1);
  });
  it("refuses a local release before the first publication", () => {
    fails([{ fm: { ...mirror, firstPublishedAt: "2026-09-10T00:00:00Z" } }], /precede/);
  });
  it("needs both first-publication fields, on the publication's own host", () => {
    fails([{ fm: { publication: "the-human-butterfly" } }], /firstPublishedUrl/);
    fails([{ fm: { ...mirror, firstPublishedUrl: "https://elsewhere.example.com/p/x" } }], /own site/);
    fails([{ fm: { firstPublishedUrl: mirror.firstPublishedUrl, firstPublishedAt: mirror.firstPublishedAt } }], /first published here/);
  });
});

describe("assets (W-5)", () => {
  it("refuses path traversal, executables and missing files", () => {
    fails([{ fm: { cover: { src: "../x.png", alt: "a", credit: "c" } } }], /cover/);
    fails([{ fm: {}, files: { "assets/run.sh": "x" } }], /disallowed type/);
    fails([{ fm: { cover: { src: "assets/none.png", alt: "a", credit: "c" } } }], /does not exist/);
    fails([{ fm: { cover: { src: "assets/c.png", credit: "c" } }, files: { "assets/c.png": "x" } }], /alt/);
  });
  it("serves only assets a published essay names", () => {
    const root = essayRoot([{ fm: { cover: { src: "assets/c.png", alt: "a", credit: "c" } }, files: { "assets/c.png": "x" } }]);
    expect(essayAssetPath("s", "c.png", NOW, root)).toMatch(/assets\/c\.png$/);
    expect(essayAssetPath("s", "../index.mdx", NOW, root)).toBeNull();
    expect(essayAssetPath("nope", "c.png", NOW, root)).toBeNull();
  });
});

describe("trusted MDX (W-1)", () => {
  it.each([
    ["import x from 'y'\n\nText", /import\/export/],
    ["Text {1 + 1}", /expressions/],
    ["<Script />", /not an approved component/],
    ["<div>raw</div>", /not an approved component/],
    ['<MarginNote note={"x"}>a</MarginNote>', /literal string/],
    ["[x](javascript:alert(1))", /unsafe link/],
    ["[x](//evil.example)", /unsafe link/],
    ["[x](/\\evil.example)", /unsafe link/],
    ["[x](\\\\\\\\evil.example)", /unsafe link/], // Markdown unescapes this to \\evil.example
    ["[x](</\t/evil.example>)", /unsafe link/], // a literal tab; browsers delete it and read //evil.example
    ["[x](/&#9;/evil.example)", /unsafe link/], // the same tab as a character reference
    ["[x](/&#10;/evil.example)", /unsafe link/],
    ["[x](/&#13;/evil.example)", /unsafe link/],
    ["[x]: </\t/evil.example>\n\n[x]", /unsafe link/],
    ["![x](/a.png)", /inline images/],
  ])("refuses %j", (body, pattern) => {
    expect(() => parseMdx(body)).toThrow(pattern);
    expect(() => parseMdx(body)).toThrow(ContentError);
  });
  it("strips tab, CR and LF before checking a link, as browsers do (A5)", () => {
    for (const bad of ["/\t/host", "/\n/host", "/\r/host", "\t//host", "/\t\\host", "java\tscript:alert(1)", ""]) {
      expect(isSafeHref(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const ok of ["/words", "/wo\trds", "#note", "https://example.com", "mailto:a@example.com"]) {
      expect(isSafeHref(ok), JSON.stringify(ok)).toBe(true);
    }
  });
  it("accepts Markdown and approved components", () => {
    expect(() => parseMdx("[home](/words) [x](/words/a-b)")).not.toThrow();
    expect(() => parseMdx("# A\n\n<MarginNote>note</MarginNote>\n\n<CrisisSupport />\n\n[link](https://example.com)")).not.toThrow();
  });
  it("requires the crisis block wherever suicide is mentioned (Q-1)", () => {
    fails([{ fm: {}, body: "A passage about suicide." }], /CrisisSupport/);
    expect(publishedEssays(NOW, essayRoot([{ fm: {}, body: "A passage about suicide.\n\n<CrisisSupport />" }]))).toHaveLength(1);
  });
  it("leaves the block for front-matter fields to the page, which attaches it (D4)", () => {
    expect(publishedEssays(NOW, essayRoot([{ fm: { title: "Synthetic on suicide", subtitle: "Synthetic suicide", summary: "Synthetic suicide." } }]))).toHaveLength(1);
  });
  it("requires a Record body that mentions suicide to place the block", () => {
    const root = mkdtempSync(join(tmpdir(), "record-"));
    const fixture = readFileSync("tests/fixtures/record/synthetic-entry.mdx", "utf8");
    writeFileSync(join(root, "synthetic-entry.mdx"), fixture.replace("Synthetic description of what changed.", "A passage about suicide."));
    expect(() => loadAllRecord(root)).toThrow(/CrisisSupport/);
    writeFileSync(join(root, "synthetic-entry.mdx"), fixture.replace("Synthetic open item.", "Synthetic open item about suicide."));
    expect(loadAllRecord(root)).toHaveLength(1);
  });
});

describe("content directories", () => {
  it("refuses a fixtures directory unless explicitly allowed", () => {
    expect(() => contentDir("ESSAYS_DIR", "x", { ESSAYS_DIR: FIXTURES })).toThrow(/fixtures/);
    expect(contentDir("ESSAYS_DIR", "x", { ESSAYS_DIR: FIXTURES, ALLOW_CONTENT_FIXTURES: "true" })).toMatch(/fixtures\/essays$/);
  });
  it("validates the repository's real content (none published yet)", () => {
    expect(loadAllEssays(contentDir("ESSAYS_DIR", "content/essays", {}))).toEqual([]);
    expect(loadAllRecord(contentDir("RECORD_DIR", "content/record", {}))).toEqual([]);
  });
  it("loads the shared test fixtures", () => {
    expect(publishedEssays(NOW, FIXTURES).map((e) => e.slug)).toEqual(["synthetic-site-essay", "synthetic-mirror"]);
    expect(publishedRecord(NOW, "tests/fixtures/record").map((e) => e.slug)).toEqual(["synthetic-entry"]);
  });
});

describe("display dates", () => {
  it("formats in the site time zone", () => {
    expect(formatDate("2026-09-30T02:00:00Z")).toBe("29 Sep 2026");
    expect(formatDate("2026-09-30T16:00:00Z")).toBe("30 Sep 2026");
  });
  it("formats a read time on a 24-hour clock with its zone", () => {
    expect(formatDateTime("2026-09-30T02:05:00Z")).toBe("29 Sep 2026, 22:05 EDT");
    expect(formatDateTime("2026-12-01T17:00:00Z")).toBe("1 Dec 2026, 12:00 EST");
  });
});

describe("rendering", () => {
  it("renders approved components as real elements, never inside a paragraph", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { renderMdx } = await import("@/lib/content/mdx");
    const html = renderToStaticMarkup(renderMdx(parseMdx('Text.\n\n<MarginNote>A note.</MarginNote>\n\nMore <SourceNote>inline</SourceNote> text.\n\n<CrisisSupport />')) as never);
    expect(html).toContain('<aside class="margin-note" aria-label="Note">A note.</aside>');
    expect(html).not.toMatch(/<p>\s*<aside class="margin-note"/);
    expect(html).toContain("call or text 988");
  });
});
