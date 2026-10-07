import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { PlanLive } from "@/components/PlanLive";
import { isEnabled } from "@/lib/flags";
import { isShown, readPlan } from "@/lib/plan/service";

export const metadata: Metadata = { title: "OneRhythm plan" };

/**
 * Read-only projection of the approved public plan (PRD §04, A-1 to A-10).
 * Off or withdrawn, the page does not exist. It never contacts Asana and
 * embeds or links nothing that shows more than the projection (A-10).
 */
export default async function OneRhythmPlanPage() {
  await connection();
  if (!isEnabled("plan")) notFound();
  const state = await readPlan();
  if (!isShown(state)) notFound();
  return (
    <PageShell title="OneRhythm plan">
      <Placeholder id="oneRhythmPlanIntro" />
      <PlanLive initial={state} />
    </PageShell>
  );
}
