import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Marrs Rover method" };

export default function MarrsRovermethodPage() {
  return (
    <PageShell title="Marrs Rover method">
      <Placeholder id="roverMethod" />
    </PageShell>
  );
}
