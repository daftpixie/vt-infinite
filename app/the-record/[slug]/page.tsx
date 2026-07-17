import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import {
  FALLBACK_SOCIAL_IMAGE,
  FALLBACK_SOCIAL_IMAGE_ALT,
  SITE_NAME
} from "../../constants";
import { Header } from "../../components";
import {
  getVisibleRecordPost,
  getVisibleRecordPosts,
  isRecordPostPublic,
  lastCommitShortHash,
  recordDateTime
} from "../../../lib/record";
import { createRecordComponents } from "../record-components";

export function generateStaticParams() {
  return getVisibleRecordPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getVisibleRecordPost(slug);
  if (!post) notFound();

  const canonical = `/the-record/${post.slug}`;
  const publicPost = isRecordPostPublic(post);
  const image = post.socialImage ?? FALLBACK_SOCIAL_IMAGE;
  const imageAlt = post.socialImageAlt ?? FALLBACK_SOCIAL_IMAGE_ALT;
  return {
    title: post.title,
    description: post.summary,
    authors: [{ name: post.author }],
    alternates: { canonical },
    robots: publicPost ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: canonical,
      title: post.title,
      description: post.summary,
      authors: [post.author],
      publishedTime: recordDateTime(post.date),
      modifiedTime: post.updated ? recordDateTime(post.updated) : undefined,
      images: [{ url: image, alt: imageAlt }]
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.summary,
      images: [{ url: image, alt: imageAlt }]
    }
  };
}

export default async function RecordEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getVisibleRecordPost(slug);
  if (!post) notFound();
  const { default: MDXContent } = await evaluate(post.body, { ...runtime });
  const hash = lastCommitShortHash(post.slug);
  const publicPost = isRecordPostPublic(post);
  return (
    <main>
      <Header />
      <section className="page-hero shell">
        <p className="eyebrow">
          <Link href="/the-record">The Record</Link> / <time dateTime={post.date}>{post.date}</time>
        </p>
        <h1>{post.title}</h1>
        <p className="record-byline">By {post.author}</p>
        {!publicPost ? (
          <p className="record-state">{post.status === "draft" ? "Draft preview — not published" : "Scheduled preview — not yet published"}</p>
        ) : null}
      </section>
      <section className="shell record-body-wrap">
        <article className="prose record-body">
          <MDXContent components={createRecordComponents(post.slug)} />
          <footer className="record-foot">
            {post.updated ? <p>Updated {post.updated.slice(0, 10)}</p> : null}
            {hash ? <p>Provenance: commit {hash}</p> : null}
          </footer>
        </article>
      </section>
    </main>
  );
}
