import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getRecordPost,
  getRecordPosts,
  isRecordPostPublic,
  resolveRecordAssetPath,
  validateRecordSlug
} from "../lib/record.ts";

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vt-record-acceptance-"));
  const directory = path.join(root, "content", "record");
  const publicDirectory = path.join(root, "public");
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(publicDirectory, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, directory, publicDirectory };
}

function mdx(fields = {}, body = "Synthetic verification content only.") {
  const values = {
    title: "Synthetic Record Acceptance",
    date: "2026-01-10",
    summary: "Synthetic metadata used only by automated verification.",
    author: "Example Reviewer",
    status: "published",
    ...fields
  };
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

function write(directory, file, content) {
  fs.writeFileSync(path.join(directory, file), content);
}

test("published, draft, and future-dated visibility is deterministic", (t) => {
  const { directory, publicDirectory } = workspace(t);
  const socialDirectory = path.join(publicDirectory, "record", "record-acceptance-published");
  fs.mkdirSync(socialDirectory, { recursive: true });
  fs.writeFileSync(path.join(socialDirectory, "social.jpg"), "synthetic image placeholder");

  write(
    directory,
    "record-acceptance-published.mdx",
    mdx({
      author: "Matthew J. Adams",
      updated: "2026-01-11",
      socialImage: "/record/record-acceptance-published/social.jpg",
      socialImageAlt: "Synthetic verification card"
    })
  );
  write(directory, "record-acceptance-draft.mdx", mdx({ status: "draft" }));
  write(directory, "record-acceptance-future.mdx", mdx({ date: "2099-01-01" }));

  const production = getRecordPosts({ directory, publicDirectory, today: "2026-07-17" });
  assert.deepEqual(production.map((post) => post.slug), ["record-acceptance-published"]);
  assert.equal(production[0].author, "Matthew J. Adams");
  assert.equal(production[0].socialImageAlt, "Synthetic verification card");

  const preview = getRecordPosts({ directory, publicDirectory, includeUnpublished: true, today: "2026-07-17" });
  assert.deepEqual(
    preview.map((post) => post.slug),
    ["record-acceptance-future", "record-acceptance-published", "record-acceptance-draft"]
  );
  assert.equal(getRecordPost("record-acceptance-draft", { directory, publicDirectory, today: "2026-07-17" }), undefined);
  assert.equal(
    getRecordPost("record-acceptance-draft", { directory, publicDirectory, includeUnpublished: true })?.status,
    "draft"
  );
  assert.equal(isRecordPostPublic(preview[0], "2026-07-17"), false);
  assert.equal(isRecordPostPublic(production[0], "2026-07-17"), true);
});

test("templates remain excluded from content discovery", (t) => {
  const { directory, publicDirectory } = workspace(t);
  write(directory, "_TEMPLATE.mdx", "This intentionally is not valid frontmatter.");
  assert.deepEqual(getRecordPosts({ directory, publicDirectory, includeUnpublished: true }), []);
});

test("duplicate discovered slugs are rejected", (t) => {
  const { directory, publicDirectory } = workspace(t);
  write(directory, "duplicate-entry.mdx", mdx());
  const originalReadDirectory = fs.readdirSync;
  fs.readdirSync = () => ["duplicate-entry.mdx", "duplicate-entry.mdx"];
  try {
    assert.throws(
      () => getRecordPosts({ directory, publicDirectory, includeUnpublished: true }),
      /duplicate slug "duplicate-entry"/
    );
  } finally {
    fs.readdirSync = originalReadDirectory;
  }
});

test("slug and asset validation confines each post to its own public directory", (t) => {
  const { publicDirectory } = workspace(t);
  assert.doesNotThrow(() => validateRecordSlug("lowercase-hyphenated-2"));
  assert.throws(() => validateRecordSlug(""), /empty slug/);
  assert.throws(() => validateRecordSlug("Bad-Slug"), /lowercase letters/);
  assert.throws(() => validateRecordSlug("feed.xml"), /reserved/);

  const valid = resolveRecordAssetPath("synthetic-note", "/record/synthetic-note/card.jpg", publicDirectory);
  assert.equal(valid, path.join(publicDirectory, "record", "synthetic-note", "card.jpg"));
  assert.throws(
    () => resolveRecordAssetPath("synthetic-note", "/record/another-note/card.jpg", publicDirectory),
    /must be inside/
  );
  assert.throws(
    () => resolveRecordAssetPath("synthetic-note", "/record/synthetic-note/../secret.jpg", publicDirectory),
    /must name a file/
  );
  assert.throws(
    () => resolveRecordAssetPath("synthetic-note", "/record/synthetic-note/%2e%2e/secret.jpg", publicDirectory),
    /unsupported path characters/
  );
});

const invalidCases = [
  {
    name: "missing author",
    file: "invalid-missing-author.mdx",
    content: mdx({ author: undefined }),
    expected: /frontmatter "author" is required/
  },
  {
    name: "invalid status",
    file: "invalid-status.mdx",
    content: mdx({ status: "reviewing" }),
    expected: /must be "draft" or "published"/
  },
  {
    name: "invalid calendar date",
    file: "invalid-date.mdx",
    content: mdx({ date: "2026-02-30" }),
    expected: /real ISO calendar date/
  },
  {
    name: "updated before publication",
    file: "invalid-updated.mdx",
    content: mdx({ updated: "2026-01-09" }),
    expected: /must not be earlier/
  },
  {
    name: "unknown frontmatter",
    file: "invalid-unknown.mdx",
    content: mdx({ unexpected: "value" }),
    expected: /unknown frontmatter key/
  },
  {
    name: "unsafe social asset",
    file: "invalid-unsafe-asset.mdx",
    content: mdx({ socialImage: "/record/invalid-unsafe-asset/../secret.jpg", socialImageAlt: "Unsafe" }),
    expected: /must name a file/
  },
  {
    name: "social image without alt",
    file: "invalid-social-alt.mdx",
    content: mdx({ socialImage: "/record/invalid-social-alt/social.jpg" }),
    expected: /must be supplied together/
  },
  {
    name: "social image with empty alt",
    file: "invalid-social-empty-alt.mdx",
    content: mdx({ socialImage: "/record/invalid-social-empty-alt/social.jpg", socialImageAlt: "   " }),
    expected: /must be supplied together/
  },
  {
    name: "missing social image file",
    file: "invalid-missing-social.mdx",
    content: mdx({ socialImage: "/record/invalid-missing-social/social.jpg", socialImageAlt: "Missing" }),
    expected: /does not identify a file/
  },
  {
    name: "invalid filename slug",
    file: "Invalid-Slug.mdx",
    content: mdx(),
    expected: /lowercase letters/
  },
  {
    name: "reserved filename slug",
    file: "feed.xml.mdx",
    content: mdx(),
    expected: /reserved/
  },
  {
    name: "empty filename slug",
    file: ".mdx",
    content: mdx(),
    expected: /empty slug/
  }
];

for (const invalidCase of invalidCases) {
  test(`rejects ${invalidCase.name}`, (t) => {
    const { directory, publicDirectory } = workspace(t);
    write(directory, invalidCase.file, invalidCase.content);
    assert.throws(
      () => getRecordPosts({ directory, publicDirectory, includeUnpublished: true, today: "2026-07-17" }),
      invalidCase.expected
    );
  });
}
