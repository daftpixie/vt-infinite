import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EssayArticle } from "@/components/essay";
import { findEssay } from "@/lib/content/essays";
import { documentTitle, withoutCrisisBlock } from "@/lib/crisis";
import { siteUrl } from "@/lib/site";
import { fullSiteOnly } from "@/lib/mode-gate";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const essay = findEssay((await params).slug);
  if (!essay) return {};
  // A mirror names its first publication as canonical (PRD §06, P2). The
  // document title and meta description cannot carry the crisis block, so a
  // title or summary that mentions suicide stays on the page only.
  return {
    title: documentTitle(essay.title, "essay"),
    description: withoutCrisisBlock(essay.summary),
    alternates: { canonical: essay.firstPublishedUrl ?? `${siteUrl()}/words/${essay.slug}` },
  };
}

/** Drafts and held pieces never render (W-2). */
export default async function EssayPage({ params }: Props) {
  await connection();
  fullSiteOnly();
  const essay = findEssay((await params).slug);
  if (!essay) notFound();
  return <EssayArticle essay={essay} />;
}
