import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Corrections } from "@/components/Corrections";
import { ExternalLink } from "@/components/ExternalLink";
import { formatDate } from "@/lib/content/dates";
import { findEssay } from "@/lib/content/essays";
import { renderMdx } from "@/lib/content/mdx";
import { siteUrl } from "@/lib/site";
import { publicationName } from "@/lib/words";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const essay = findEssay((await params).slug);
  if (!essay) return {};
  // A mirror names its first publication as canonical (PRD §06, P2).
  return {
    title: essay.title,
    description: essay.summary,
    alternates: { canonical: essay.firstPublishedUrl ?? `${siteUrl()}/words/${essay.slug}` },
  };
}

/** An essay page in the PRD §06 order. Drafts and held pieces never render (W-2). */
export default async function EssayPage({ params }: Props) {
  await connection();
  const essay = findEssay((await params).slug);
  if (!essay) notFound();
  return (
    <article className="wrap essay">
      <Corrections corrections={essay.corrections} />
      <header>
        <h1>{essay.title}</h1>
        {essay.subtitle ? <p className="standfirst">{essay.subtitle}</p> : null}
        <p className="byline">{essay.author}</p>
        <p className="label">
          Published here <time dateTime={essay.publishAt}>{formatDate(essay.publishAt)}</time>
        </p>
        {essay.firstPublishedUrl && essay.firstPublishedAt ? (
          <p className="label">
            First published in <cite>{publicationName(essay.publication)}</cite>,{" "}
            <time dateTime={essay.firstPublishedAt}>{formatDate(essay.firstPublishedAt)}</time>:{" "}
            <ExternalLink href={essay.firstPublishedUrl}>read it there</ExternalLink>
          </p>
        ) : null}
      </header>
      {essay.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- a reviewed local asset
        <img className="essay-cover" src={`/words/${essay.slug}/${essay.cover.src}`} alt={essay.cover.alt} />
      ) : null}
      <div className="prose">{renderMdx(essay.tree)}</div>
      <footer className="essay-footer">
        {essay.cover ? <p className="label">Cover: {essay.cover.credit}</p> : null}
        {essay.pdf ? (
          <p>
            <a href={`/words/${essay.slug}/${essay.pdf.src}`}>{essay.pdf.label ?? "Download the PDF"}</a>
          </p>
        ) : null}
      </footer>
    </article>
  );
}
