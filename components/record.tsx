import Link from "next/link";
import { formatDate } from "@/lib/content/dates";
import { renderMdx } from "@/lib/content/mdx";
import type { RecordEntry } from "@/lib/content/record";
import { mentionsSuicide } from "@/lib/crisis";
import { Corrections } from "./Corrections";
import { CrisisSupport } from "./CrisisSupport";
import { ExternalLink } from "./ExternalLink";

/**
 * A Record entry: what changed, the evidence, who decided, and what is
 * still open (brand §05). Wherever a field that mentions suicide renders,
 * the crisis block renders with it: under the header for the title, and
 * after "What is still open" for who decided and what is open. The body
 * places its own block (the loader requires it).
 */
export function RecordArticle({ entry }: { entry: RecordEntry }) {
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
      {mentionsSuicide(entry.title) ? <CrisisSupport /> : null}
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
      {mentionsSuicide(entry.decidedBy, entry.open) ? <CrisisSupport /> : null}
    </article>
  );
}

/** The Record index: titles and summaries, with the crisis block when any of them mentions suicide. */
export function RecordList({ entries }: { entries: RecordEntry[] }) {
  if (entries.length === 0) return <p>No entries have been published yet.</p>;
  return (
    <>
      <ol className="words-list">
        {entries.map((e) => (
          <li key={e.slug} className="words-item">
            <h2 className="words-title">
              <Link href={`/the-record/${e.slug}`}>{e.title}</Link>
            </h2>
            <p className="words-subtitle">{e.summary}</p>
            <p className="label">
              <time dateTime={e.publishAt}>{formatDate(e.publishAt)}</time>
              {e.republication ? " · republished" : ""}
            </p>
          </li>
        ))}
      </ol>
      {entries.some((e) => mentionsSuicide(e.title, e.summary)) ? <CrisisSupport /> : null}
    </>
  );
}
