import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DEMO_ENTITY_ID, isEnabled } from "@/lib/flags";

/** Reporting periods arrive with the stage 4 demo. Real entities also need their flag. */
export default async function PeriodPage({ params }: { params: Promise<{ entity: string }> }) {
  await connection();
  const { entity } = await params;
  if (entity !== DEMO_ENTITY_ID && !isEnabled("marrsRoverRealData")) notFound();
  notFound();
}
