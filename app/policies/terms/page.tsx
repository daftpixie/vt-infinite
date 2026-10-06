import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <PageShell title="Terms">
      <Placeholder id="policyTerms" />
    </PageShell>
  );
}
