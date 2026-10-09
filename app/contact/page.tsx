import type { Metadata } from "next";
import { CrisisSupport } from "@/components/CrisisSupport";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  fullSiteOnly();
  return (
    <PageShell title="Contact">
      <p>Write to us about the work.</p>
      <Placeholder id="contactEmail" />
      <Placeholder id="communityLink" />
      <CrisisSupport />
    </PageShell>
  );
}
