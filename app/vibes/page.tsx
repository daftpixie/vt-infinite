import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Vibes" };

export default function VibesPage() {
  return (
    <PageShell title="Vibes">
      <Placeholder id="vibesNowPlaying" />
    </PageShell>
  );
}
