import type { Metadata } from "next";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { RecordList } from "@/components/record";
import { publishedRecord } from "@/lib/content/record";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "The Record" };
}

export default async function RecordPage() {
  await connection();
  fullSiteOnly();
  return (
    <PageShell title="The Record">
      <RecordList entries={publishedRecord()} />
      <p>
        <a href="/the-record/feed.xml">Subscribe to the Record (RSS)</a>
      </p>
    </PageShell>
  );
}
