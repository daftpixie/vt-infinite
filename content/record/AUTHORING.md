# Publishing to The Record

One entry is one trusted `.mdx` file in this directory. There is no CMS, login, database, or public editor. Every entry is reviewed and published through Git.

Record MDX is application code. JavaScript expressions and raw JSX can execute during development or the production build. Only trusted, Git-reviewed content may be added. Never copy an untrusted or public submission directly into this directory.

## Draft, review, and publish

1. Copy `_TEMPLATE.mdx` to `content/record/<slug>.mdx`.
2. Choose a filename containing only lowercase letters, numbers, and single hyphens. The filename becomes the URL: `synthetic-example.mdx` becomes `https://vt-infinite.com/the-record/synthetic-example`. `feed.xml` is reserved.
3. Keep `status: "draft"` while writing and reviewing. Do not use a leading underscore for a post; leading-underscore files are excluded templates rather than previewable drafts.
4. Fill in every required field:
   - `title`: the displayed and metadata title.
   - `date`: a real calendar date in `YYYY-MM-DD` form.
   - `summary`: the index excerpt, metadata description, and RSS description.
   - `author`: the human byline, such as `Matthew J. Adams`.
   - `status`: exactly `draft` or `published`.
5. Add `updated` only when needed. It must be a real `YYYY-MM-DD` date and cannot be earlier than `date`.
6. Run `npm run dev`, then review the draft at `http://localhost:3000/the-record/<slug>`. Local development shows drafts with a visible draft label and `noindex, nofollow` metadata. Drafts are excluded from production routes, the production index, and RSS.
7. Review the prose and claims with the named human author. Record MDX must pass Git review because its JavaScript expressions and JSX are trusted code.
8. Run the validation commands listed below.
9. After explicit human approval, change only `status: "draft"` to `status: "published"` and rerun validation.
10. Confirm the published entry appears on `/the-record`, its article route has the correct byline and metadata, and `/the-record/feed.xml` contains the entry and author.
11. Review the complete Git diff. Confirm that the intended content and assets are the only publication changes.
12. Commit and push through the normal Git review workflow. A commit and push are the publication mechanism; do not bypass review or deploy manually.

A post marked `published` with a future `date` remains locally previewable as a scheduled preview but is excluded from production routes, the index, and RSS until that UTC calendar date. This prevents an accidentally future-dated entry from publishing early.

## Frontmatter reference

Required fields are `title`, `date`, `summary`, `author`, and `status`. Optional fields are `updated`, `socialImage`, and `socialImageAlt`. Unknown, duplicate, empty, or malformed fields fail validation.

`socialImage` and `socialImageAlt` must be supplied together. If they are omitted, metadata uses the existing VT Infinite mark as the site-wide fallback.

Example metadata for a fictional entry:

```md
---
title: "Synthetic Systems Note"
date: "2026-01-15"
summary: "A fictional entry used to demonstrate Record metadata."
author: "Example Author"
status: "draft"
socialImage: "/record/synthetic-systems-note/social-card.jpg"
socialImageAlt: "Abstract black lines on a white field"
---
```

## Inline images

Put images in `public/record/<slug>/`, matching the post slug. A post cannot reference another post's asset directory or escape its own directory.

```md
![Diagram showing three connected review stages](/record/synthetic-systems-note/review-stages.png "Three review stages")
```

Inline-image alt text is required. The quoted Markdown title is optional and becomes the visible caption. Images are dimensioned at build time and rendered through `next/image`.

## Social images

Put a post-specific social image in the same asset directory and add both fields:

```md
socialImage: "/record/synthetic-systems-note/social-card.jpg"
socialImageAlt: "Abstract black lines on a white field"
```

The path must resolve to a real file beneath `public/record/<slug>/`. Do not use URL escapes, query strings, fragments, traversal segments, or files outside that directory.

## Video

Use YouTube or Vimeo for substantial video. Embeds use privacy-conscious endpoints, lazy-load, and never autoplay.

```mdx
<Video id="VIDEO_ID_FROM_PROVIDER" provider="youtube" title="Accessible description of the presentation" />
```

`provider` must be `youtube` or `vimeo`; `id` is the provider's video ID; `title` is required for assistive technology.

For a short repository-hosted clip only, put the file in `public/record/<slug>/` and use:

```mdx
<Clip src="/record/synthetic-systems-note/short-demo.mp4" />
```

Long video does not belong in Git history.

## Validation checklist

Run all of these before requesting publication approval and again after changing the status to `published`:

```bash
npm ls --depth=0
npm run prebuild
npm run verify:record
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
npm run build
```

During local review, confirm:

- `/the-record` identifies the entry as a draft.
- `/the-record/<slug>` displays the title, author, date, draft label, and body.
- Page metadata contains `noindex, nofollow` while the entry is a draft.
- Images have meaningful alt text and video embeds have meaningful titles.

After explicit approval and the status change, confirm:

- The entry appears on `/the-record` without a draft label.
- The article has its canonical URL, author, publication date, Open Graph metadata, Twitter card metadata, and intended social image or VT Infinite fallback.
- `/the-record/feed.xml` contains the entry and author.
- An unknown slug returns a 404.

That is the complete component set: Markdown, inline images, `<Video>`, and `<Clip>`. Other JSX and JavaScript expressions remain technically possible because MDX is trusted application code; use them only after deliberate code review.
