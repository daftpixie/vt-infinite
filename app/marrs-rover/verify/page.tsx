import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Verify a Marrs Rover publication" };

export default function VerifyaMarrsRoverpublicationPage() {
  return (
    <PageShell title="Verify a Marrs Rover publication">
      <Placeholder id="roverVerify" />
    </PageShell>
  );
}
