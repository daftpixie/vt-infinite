import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Comment policy" };

export default function CommentpolicyPage() {
  return (
    <PageShell title="Comment policy">
      <Placeholder id="policyComments" />
    </PageShell>
  );
}
