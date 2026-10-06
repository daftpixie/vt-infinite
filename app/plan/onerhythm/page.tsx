import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { isEnabled } from "@/lib/flags";

export const metadata: Metadata = { title: "OneRhythm plan" };

export default async function OneRhythmPlanPage() {
  await connection();
  if (!isEnabled("plan")) notFound();
  return (
    <PageShell title="OneRhythm plan">
      <Placeholder id="oneRhythmSummary" />
    </PageShell>
  );
}
