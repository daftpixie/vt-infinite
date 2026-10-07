import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { periodPath, PlainMeaning, RoverShell, roverMetadata, StateFields } from "@/components/rover";
import { DEMO_ENTITY_ID } from "@/lib/flags";
import { periodBundles, publications } from "@/lib/marrs-rover/explorer";

type Params = { reviewId: string };

export async function generateMetadata(): Promise<Metadata> {
  return roverMetadata("Independent review", "The independent review status of one synthetic publication.");
}

/**
 * Independent review (PRD MR-13). The demo has no outside report, so the
 * review record for a demo period says exactly that. A report, a reviewer
 * and a conclusion appear only with the evidence R9 requires; the page
 * never turns their absence into a reassuring badge.
 */
export default async function ReviewPage({ params }: { params: Promise<Params> }) {
  await connection();
  const { reviewId } = await params;
  const prefix = `${DEMO_ENTITY_ID}-`;
  if (!reviewId.startsWith(prefix)) notFound();
  const b = periodBundles(publications(), DEMO_ENTITY_ID, reviewId.slice(prefix.length))[0];
  if (!b) notFound();
  const open = b.exceptions.exceptions.filter((e) => e.status === "open").length;

  return (
    <RoverShell title={`Independent review: demo period ${b.manifest.periodId}`}>
      <p>
        <Link href={periodPath(b)}>Back to period {b.manifest.periodId}</Link>
      </p>
      <h2>Status</h2>
      <p>
        <strong>Not examined.</strong> No independent reviewer has examined this synthetic publication, and no report is published with it. There is therefore no
        reviewer, scope, cutoff, method, conclusion or qualification to show.
      </p>
      <p>
        A valid bundle and matching proofs are a different thing from an outside examination: they show the files are consistent, not that the books are right.
        {open > 0 ? ` The period also has ${open} open exception${open === 1 ? "" : "s"}, which a review would have to address.` : ""}
      </p>
      <PlainMeaning bundle={b} />
      <StateFields bundle={b} />
    </RoverShell>
  );
}
