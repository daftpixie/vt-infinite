import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Privacy" };
}

export default function PrivacyPage() {
  fullSiteOnly();
  return (
    <PageShell title="Privacy">
      <Placeholder id="policyPrivacy" />
    </PageShell>
  );
}
