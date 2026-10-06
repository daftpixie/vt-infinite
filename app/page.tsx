import Link from "next/link";
import { Placeholder } from "@/components/Placeholder";
import { Unreleased } from "@/components/Unreleased";
import { FOOTER_LINES } from "@/lib/site";

// Approved lines: brand reference v1.1 §03 (D1) and PRD §05.
const MASTHEAD = "We see the problem. We go to where it is.";
const STANDFIRST = "Intelligence, conducted — in service of hard problems and the people the tools forgot.";
const MISSION =
  "VT Infinite builds tools, research, and communities that put verifiable capability in the hands of people existing systems overlook. We design for the full variation of human minds and bring human judgment and machine intelligence into working relationship to expand agency, never replace it.";

export default function HomePage() {
  return (
    <>
      <div className="wrap">
        <h1>{MASTHEAD}</h1>
        <p className="standfirst">{STANDFIRST}</p>
        <Unreleased />
        <Placeholder id="lorenzFigure" />

        <h2>Directions of work</h2>
        <Placeholder id="directionsOfWork" />
        <Placeholder id="oneRhythmSummary" />

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
        <Placeholder id="latestWords" />
        <p className="standfirst">{FOOTER_LINES.close}</p>
      </div>
    </>
  );
}
