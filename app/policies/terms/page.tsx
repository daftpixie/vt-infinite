import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  fullSiteOnly();
  return (
    <PageShell title="Terms">
      <Placeholder id="policyTerms" />
    </PageShell>
  );
}
