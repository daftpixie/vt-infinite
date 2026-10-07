import Link from "next/link";
import { connection } from "next/server";
import { LorenzFigure } from "@/components/figures/LorenzFigure";
import { Placeholder } from "@/components/Placeholder";
import { PlanSummary } from "@/components/plan";
import { Unreleased } from "@/components/Unreleased";
import { StreamStatus, WordsList } from "@/components/words";
import { publishedEssays } from "@/lib/content/essays";
import { isShown, readPlan } from "@/lib/plan/service";
import { FOOTER_LINES } from "@/lib/site";
import { readAllPublications } from "@/lib/streams/service";
import { buildWordsEntries, latestForHome } from "@/lib/words";

// Approved lines: brand reference v1.1 §03 (D1) and PRD §05.
const MASTHEAD = "We see the problem. We go to where it is.";
const STANDFIRST = "Intelligence, conducted — in service of hard problems and the people the tools forgot.";
const MISSION =
  "VT Infinite builds tools, research, and communities that put verifiable capability in the hands of people existing systems overlook. We design for the full variation of human minds and bring human judgment and machine intelligence into working relationship to expand agency, never replace it.";

export default async function HomePage() {
  await connection();
  // Home and the plan page share one snapshot (PRD §05); off or withdrawn, only the placeholder shows.
  const [streams, plan] = await Promise.all([readAllPublications(), readPlan()]);
  const latest = latestForHome(buildWordsEntries(publishedEssays(), streams));

  return (
    <>
      <div className="wrap">
        <div className="hero">
          <div className="hero-text">
            <h1>{MASTHEAD}</h1>
            <p className="standfirst">{STANDFIRST}</p>
            <Unreleased />
          </div>
          <div className="hero-figure">
            <LorenzFigure />
          </div>
        </div>

        <h2>Directions of work</h2>
        <Placeholder id="directionsOfWork" />
        {isShown(plan) ? (
          <>
            <Placeholder id="oneRhythmPlanIntro" />
            <PlanSummary state={plan} />
          </>
        ) : (
          <Placeholder id="oneRhythmSummary" />
        )}

        <h2>Marrs Rover</h2>
        <p>
          <Link href="/marrs-rover">See how Marrs Rover will show where resources go, starting with a labeled demo.</Link>
        </p>
        <Placeholder id="roverDemoEntry" />

        <h2>Proposed governance</h2>
        <p className="label">Proposed — not yet adopted</p>
        <Placeholder id="governanceIntro" />
        <p>
          <Link href="/governance">Read the proposed governance</Link>
        </p>
      </div>

      <section className="invert inversion-block" aria-labelledby="mission">
        <div className="wrap">
          <h2 id="mission">Mission</h2>
          <p>{MISSION}</p>
        </div>
      </section>

      <div className="wrap">
        <h2>Latest words</h2>
        {streams.map((s) => (
          <StreamStatus key={s.publication.id} view={s} />
        ))}
        {latest.length > 0 ? <WordsList entries={latest} headingLevel={3} /> : <p>Nothing has been published here yet.</p>}
        <p>
          <Link href="/words">All words</Link>
        </p>
        <p className="standfirst">{FOOTER_LINES.close}</p>
      </div>
    </>
  );
}
