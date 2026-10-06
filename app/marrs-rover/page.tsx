import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Marrs Rover Block Explorer" };

export default function MarrsRoverPage() {
  return (
    <PageShell title="Marrs Rover Block Explorer">
      <Placeholder id="roverIntro" />
      <Placeholder id="roverAttribution" />
      <Placeholder id="roverDemoEntry" />
      <ul>
        <li>
          <Link href="/marrs-rover/method">Method</Link>
        </li>
        <li>
          <Link href="/marrs-rover/verify">Verify</Link>
        </li>
      </ul>
    </PageShell>
  );
}
