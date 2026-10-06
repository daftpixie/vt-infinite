import type { Metadata } from "next";
import { connection } from "next/server";
import { MandelbrotFigure } from "@/components/figures/MandelbrotFigure";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { isEnabled } from "@/lib/flags";

export const metadata: Metadata = { title: "Agency" };

export default async function AgencyPage() {
  await connection();
  return (
    <PageShell title="Agency">
      <Placeholder id="agencyStory" />
      {isEnabled("mandelbrot") ? <MandelbrotFigure /> : <Placeholder id="mandelbrotFigure" />}
    </PageShell>
  );
}
