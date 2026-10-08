import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RecordArticle } from "@/components/record";
import { findRecord } from "@/lib/content/record";
import { documentTitle, withoutCrisisBlock } from "@/lib/crisis";
import { fullSiteOnly } from "@/lib/mode-gate";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const entry = findRecord((await params).slug);
  // The document title and meta description cannot carry the crisis block, so
  // a title or summary that mentions suicide stays on the page only.
  return entry ? { title: documentTitle(entry.title, "record"), description: withoutCrisisBlock(entry.summary) } : {};
}

/** Retired legacy slugs are answered with 410 by the proxy before this page runs. */
export default async function RecordEntryPage({ params }: Props) {
  await connection();
  fullSiteOnly();
  const entry = findRecord((await params).slug);
  if (!entry) notFound();
  return <RecordArticle entry={entry} />;
}
