import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Code" };

export default function CodePage() {
  return (
    <PageShell title="Code">
      <Placeholder id="codeRepos" />
      <h2>The Record</h2>
      <p>
        <Link href="/the-record">Read the Record</Link>
      </p>
    </PageShell>
  );
}
