import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Agency" };

export default function AgencyPage() {
  return (
    <PageShell title="Agency">
      <Placeholder id="agencyStory" />
      <Placeholder id="mandelbrotFigure" />
    </PageShell>
  );
}
