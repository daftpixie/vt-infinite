import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components";
import { FALLBACK_SOCIAL_IMAGE, FALLBACK_SOCIAL_IMAGE_ALT, SITE_NAME } from "../constants";
import { getVisibleRecordPosts, isRecordPostPublic } from "../../lib/record";

const description = "The running record of what is actually being built. Vision lives on the other pages. State lives here.";

export const metadata: Metadata = {
  title: "The Record",
  description,
  alternates: {
    canonical: "/the-record",
    types: { "application/rss+xml": "/the-record/feed.xml" }
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/the-record",
    title: "The Record",
    description,
    images: [{ url: FALLBACK_SOCIAL_IMAGE, width: 1024, height: 1024, alt: FALLBACK_SOCIAL_IMAGE_ALT }]
  },
  twitter: {
    card: "summary_large_image",
    title: "The Record",
    description,
    images: [{ url: FALLBACK_SOCIAL_IMAGE, alt: FALLBACK_SOCIAL_IMAGE_ALT }]
  }
};

export default function TheRecordPage() {
  const posts = getVisibleRecordPosts();
  return (
    <main>
      <Header />
      <section className="page-hero shell">
        <p className="eyebrow">The build log</p>
        <h1>The Record.</h1>
        <p className="lede">The running record of what is actually being built. Vision lives on the other pages. State lives here.</p>
      </section>
      <section className="shell record-list" aria-label="Record entries">
        {posts.length === 0 ? (
          <p className="record-empty">No entries yet.</p>
        ) : (
          posts.map((post) => (
            <article className="record-entry" key={post.slug}>
              <div className="record-entry-meta">
                <time dateTime={post.date}>{post.date}</time>
                {!isRecordPostPublic(post) ? (
                  <span className="record-state">{post.status === "draft" ? "Draft preview" : "Scheduled preview"}</span>
                ) : null}
              </div>
              <div>
                <h2>
                  <Link href={`/the-record/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.summary}</p>
                <p className="record-entry-author">By {post.author}</p>
              </div>
            </article>
          ))
        )}
        <p className="record-feed-link">
          <a href="/the-record/feed.xml">RSS feed</a>
        </p>
      </section>
    </main>
  );
}
