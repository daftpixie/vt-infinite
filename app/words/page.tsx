import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Words" };

export default function WordsPage() {
  return (
    <PageShell title="Words">
      <Placeholder id="wordsIndex" />
    </PageShell>
  );
}
