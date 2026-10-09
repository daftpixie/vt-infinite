import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { StreamStatus, WordsList } from "@/components/words";
import { publishedEssays } from "@/lib/content/essays";
import { readAllPublications } from "@/lib/streams/service";
import { buildWordsEntries } from "@/lib/words";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Words" };
}

/**
 * Publication streams and approved local essays, newest first, with a
 * publication filter that works without JavaScript (PRD §06).
 */
export default async function WordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  fullSiteOnly();
  const essays = publishedEssays();
  const streams = await readAllPublications();
  const all = buildWordsEntries(essays, streams);
  const publications = [...new Map(all.map((e) => [e.publicationId, e.publicationName])).entries()];
  const raw = (await searchParams).publication;
  const selected = typeof raw === "string" && publications.some(([id]) => id === raw) ? raw : null;
  const entries = selected ? all.filter((e) => e.publicationId === selected) : all;

  return (
    <PageShell title="Words">
      {streams.map((s) => (
        <StreamStatus key={s.publication.id} view={s} />
      ))}
      {publications.length > 1 ? (
        <nav aria-label="Filter by publication" className="filter">
          <ul className="filter-list">
            <li>
              <Link href="/words" aria-current={selected === null ? "page" : undefined}>
                All
              </Link>
            </li>
            {publications.map(([id, name]) => (
              <li key={id}>
                <Link href={`/words?publication=${encodeURIComponent(id)}`} aria-current={selected === id ? "page" : undefined}>
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {entries.length > 0 ? <WordsList entries={entries} /> : <p>Nothing has been published here yet.</p>}
    </PageShell>
  );
}
