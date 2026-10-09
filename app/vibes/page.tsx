import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export const metadata: Metadata = { title: "Vibes" };

export default function VibesPage() {
  fullSiteOnly();
  return (
    <PageShell title="Vibes">
      <Placeholder id="vibesNowPlaying" />
    </PageShell>
  );
}
