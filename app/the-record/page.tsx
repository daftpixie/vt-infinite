import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "The Record" };

export default function TheRecordPage() {
  return (
    <PageShell title="The Record">
      <Placeholder id="recordEntries" />
    </PageShell>
  );
}
