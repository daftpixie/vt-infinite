import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EssayArticle } from "@/components/essay";
import { findEssay } from "@/lib/content/essays";
import { withoutCrisisBlock } from "@/lib/crisis";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const essay = findEssay((await params).slug);
  if (!essay) return {};
  // A mirror names its first publication as canonical (PRD §06, P2). A meta
  // description cannot carry the crisis block, so a summary that mentions
  // suicide stays off it.
  return {
    title: essay.title,
    description: withoutCrisisBlock(essay.summary),
    alternates: { canonical: essay.firstPublishedUrl ?? `${siteUrl()}/words/${essay.slug}` },
  };
}

/** Drafts and held pieces never render (W-2). */
export default async function EssayPage({ params }: Props) {
  await connection();
  const essay = findEssay((await params).slug);
  if (!essay) notFound();
  return <EssayArticle essay={essay} />;
}
