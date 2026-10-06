import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { formatDate } from "@/lib/content/dates";
import { publishedRecord } from "@/lib/content/record";

export const metadata: Metadata = { title: "The Record" };

export default async function RecordPage() {
  await connection();
  const entries = publishedRecord();
  return (
    <PageShell title="The Record">
      {entries.length === 0 ? (
        <p>No entries have been published yet.</p>
      ) : (
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
      )}
      <p>
        <a href="/the-record/feed.xml">Subscribe to the Record (RSS)</a>
      </p>
    </PageShell>
  );
}
