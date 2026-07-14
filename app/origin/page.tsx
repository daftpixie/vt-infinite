import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components";

export const metadata: Metadata = { title: "Origin", description: "The heart, the vigilance, and the purpose behind VT Infinite." };

export default function OriginPage() {
  return (
    <main>
      <Header />
      <section className="page-hero shell">
        <p className="eyebrow">The origin</p>
        <h1>The illness ended.<br />The operating system did not.</h1>
        <p className="lede">VT first meant ventricular tachycardia. Infinite is the capacity that remained when survival no longer needed all of it.</p>
      </section>
      <section className="page-grid shell">
        <aside>
          <p>Matthew J Adams<br />Founder, VT Infinite</p>
          <img className="inline-mark" src="/vt-infinite-origin.png" alt="The original VT Infinite heart mark" width={1024} height={1024} />
        </aside>
        <article className="prose">
          <h2>A life under signal</h2>
          <p>For more than a decade, ventricular tachycardia and other arrhythmias imposed their own operating system on my life. Another threat signal was always coming. Most passed. Some became sustained rhythms, another procedure, or a shock from the defibrillator wired into my chest.</p>
          <p>You keep going anyway. You perform. You provide. You protect the people who depend on you—not because you are fearless, but because fear does not remove the obligation.</p>
          <p>Five cardiac ablations by the age of forty changed how my mind worked. I learned to monitor several threats at once, find signal in noise, make decisions with incomplete information, and continue while knowing the ground could change without warning.</p>

          <h2>The quiet</h2>
          <p>In December 2024, the rhythm became quiet. The brain fog began to lift. I could hold a thought again. I could follow an idea through several layers without watching it dissolve. The background process that had monitored my heart for a decade finally stopped.</p>
          <p>The quiet was a gift. It was also disorienting. I had adapted to chaos so completely that I did not immediately know who I was without it.</p>
          <blockquote>The chaos became capacity. The capacity needed somewhere to go.</blockquote>

          <h2>Vigilant tangents</h2>
          <p>VT became Vigilant Tangents: the instinct to notice the signal, follow the difficult question, and keep looking after others have turned away. When a question matters, I will ask it. When the first answer does not survive examination, I will ask again.</p>
          <p>That vigilance is now enforced at every node in the work. Every material claim should retain its provenance. Every consequential conclusion should remain open to challenge. Systems should be measured against the outcomes of the humans they exist to serve.</p>
          <p>Transparency is not indiscriminate disclosure. Privacy, security, and vulnerable people must be protected. The mandate is precise: no consequential claim without provenance, no consequential decision without an auditable path, and no hidden loss transferred to the human being the system was built to serve.</p>

          <h2>The mark</h2>
          <p>The circle is infinite. Within it sits the V: vigilance. The lines rise beyond the circle and meet above it, forming a roof. The tangents are the questions, disciplines, and intelligences conducted toward a common purpose.</p>
          <blockquote>I am building roofs over the people and principles I love—not shelters from change, but structures strong enough to help people stand within it.</blockquote>
          <p>VT Infinite began in my heart. It was never meant to end there.</p>

          <div className="closing-cta">
            <p className="eyebrow">What the vigilance built first</p>
            <h2>Meet Phial.</h2>
            <p>A governed research operating system born from a question I could not ignore.</p>
            <Link className="button button-inverse" href="/phial">Explore Phial</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
