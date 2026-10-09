import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Proposed corporate governance" };
}

/**
 * GOV-1 to GOV-3: informational only. No participation, voting, wallet or
 * demonstration surface lives here; dormant modules stay behind their flags.
 */
export default function GovernancePage() {
  fullSiteOnly();
  return (
    <PageShell title="Proposed corporate governance">
      <p className="label">Proposed — not yet adopted</p>
      <Placeholder id="governanceReviewed" />
      <Placeholder id="governanceSummary" />
    </PageShell>
  );
}
