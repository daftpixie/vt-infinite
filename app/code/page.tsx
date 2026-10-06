import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Code" };

export default function CodePage() {
  return (
    <PageShell title="Code">
      <Placeholder id="codeRepos" />
      <Placeholder id="recordEntries" />
    </PageShell>
  );
}
