import type { Metadata } from "next";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { NowPlaying } from "@/components/now-playing/NowPlaying";
import { fullSiteOnly } from "@/lib/mode-gate";
import { landingNowPlaying } from "@/lib/now-playing/page";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Vibes" };
}

export default async function VibesPage() {
  await connection();
  fullSiteOnly();
  // The same component as `/` (ADR 0009); off, the placeholder stays.
  const nowPlaying = await landingNowPlaying();
  return <PageShell title="Vibes">{nowPlaying ? <NowPlaying initial={nowPlaying} /> : <Placeholder id="vibesNowPlaying" />}</PageShell>;
}
