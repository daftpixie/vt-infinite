import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Corrections } from "@/components/Corrections";
import { ExternalLink } from "@/components/ExternalLink";
import { formatDate } from "@/lib/content/dates";
import { renderMdx } from "@/lib/content/mdx";
import { findRecord } from "@/lib/content/record";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const entry = findRecord((await params).slug);
  return entry ? { title: entry.title, description: entry.summary } : {};
}

/**
 * A Record entry: what changed, the evidence, who decided, and what is
 * still open (brand §05). Retired legacy slugs are answered with 410 by the
 * proxy before this page runs.
 */
export default async function RecordEntryPage({ params }: Props) {
  await connection();
  const entry = findRecord((await params).slug);
  if (!entry) notFound();
  return (
    <article className="wrap essay">
      <Corrections corrections={entry.corrections} />
      <header>
        <h1>{entry.title}</h1>
        <p className="label">
          <time dateTime={entry.publishAt}>{formatDate(entry.publishAt)}</time>
        </p>
        {entry.republication ? (
          <p className="label">
            Republished; first published <time dateTime={entry.republication.originalPublishedAt}>{formatDate(entry.republication.originalPublishedAt)}</time>
          </p>
        ) : null}
      </header>
      <h2>What changed</h2>
      <div className="prose">{renderMdx(entry.tree)}</div>
      <h2>Evidence</h2>
      <ul>
        {entry.evidence.map((ev) => (
          <li key={ev.url}>
            <ExternalLink href={ev.url}>{ev.label}</ExternalLink> · <time dateTime={ev.date}>{formatDate(ev.date)}</time>
          </li>
        ))}
      </ul>
      <h2>Who decided</h2>
      <p>{entry.decidedBy}</p>
      <h2>What is still open</h2>
      <p>{entry.open}</p>
    </article>
  );
}
