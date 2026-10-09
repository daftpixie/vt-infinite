import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Comment policy" };
}

export default function CommentpolicyPage() {
  fullSiteOnly();
  return (
    <PageShell title="Comment policy">
      <Placeholder id="policyComments" />
    </PageShell>
  );
}
