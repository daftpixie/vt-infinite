import Link from "next/link";
import { formatDate } from "@/lib/content/dates";
import type { StreamView } from "@/lib/streams/service";
import type { WordsEntry } from "@/lib/words";
import { ExternalLink } from "./ExternalLink";

export function WordsList({ entries, headingLevel = 2 }: { entries: WordsEntry[]; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <ol className="words-list">
      {entries.map((e) => (
        <li key={e.key} className="words-item">
          <H className="words-title">
            {e.local ? <Link href={e.href}>{e.title}</Link> : <ExternalLink href={e.href}>{e.title}</ExternalLink>}
          </H>
          {e.subtitle ? <p className="words-subtitle">{e.subtitle}</p> : null}
          <p className="label">
            <time dateTime={e.date}>{formatDate(e.date)}</time> · {e.publicationName}
            {e.local ? "" : " · first published there"}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Server-rendered stream state (PRD SS-5): a failed first read says the feed
 * is unavailable; an empty successful read says there are no posts; an old
 * read is labeled with its date.
 */
export function StreamStatus({ view }: { view: StreamView }) {
  const name = <cite>{view.publication.name}</cite>;
  if (view.status === "unavailable") {
    return (
      <p className="notice-inline" data-stream-status="unavailable">
        ▪ {name}: Publication feed unavailable.
      </p>
    );
  }
  if (view.status === "stale") {
    return (
      <p className="notice-inline" data-stream-status="stale">
        ▪ {name}: last read <time dateTime={view.fetchedAt}>{formatDate(view.fetchedAt)}</time>. Newer posts may be missing.
      </p>
    );
  }
  if (view.items.length === 0) {
    return (
      <p className="notice-inline" data-stream-status="empty">
        {name}: No posts yet.
      </p>
    );
  }
  return null;
}
