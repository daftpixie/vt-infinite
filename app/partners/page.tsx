import type { Metadata } from "next";
import Link from "next/link";
import { ContactActions, Header } from "../components";

export const metadata: Metadata = { title: "Partners", description: "The funding and partnership case for VT Infinite and Phial." };

export default function PartnersPage() {
  return (
    <main>
      <Header />
      <section className="page-hero shell">
        <p className="eyebrow">Aligned capital</p>
        <h1>Fund the system<br />that keeps judgment human.</h1>
        <p className="lede">VT Infinite is seeking funding and expert partners to turn a demonstrated research workflow into durable, open infrastructure.</p>
      </section>
      <section className="page-grid shell">
        <aside><p>The opportunity<br />Phial / HEOR infrastructure</p></aside>
        <article className="prose">
          <h2>The thesis</h2>
          <p>Frontier models are making expert work faster before institutions have established how that work should remain auditable, governable, and truly under expert control. In consequential research, speed without provenance increases risk. Governance bolted on afterward becomes theater.</p>
          <p>Phial makes the control layer part of the workflow itself. The opportunity is not to replace health economists. It is to give them an operating system that preserves judgment while compounding capability.</p>

          <div className="facts">
            <article><span>Product</span><strong>Audit-ready evidence-to-model operating system</strong></article>
            <article><span>Initial wedge</span><strong>Model validation and evidence-driven refresh</strong></article>
            <article><span>Benchmark</span><strong>End-to-end CHAMPION-AF research workflow</strong></article>
            <article><span>Business model</span><strong>Open core + managed orchestration and reliability</strong></article>
          </div>

          <h2>Where the work stands</h2>
          <p>The governance foundation is complete and independently audited — the rules under which Phial is built, challenged, corrected, and reproduced were tested before the first feature was written. Application development is now active.</p>
          <p>The CHAMPION-AF benchmark paper is being prepared for release through GitHub and Zenodo, then direct distribution to expert reviewers. That review is the first live evaluation of the discipline Phial enforces.</p>
          <p>Day-to-day progress is published in <Link className="inline-link" href="/the-record">The Record</Link>. We built the habit of showing our work before we built the product.</p>

          <h2>Who belongs in the room</h2>
          <p>We are interested in partners who understand health economics, scientific infrastructure, AI governance, open-source commercialization, or the patient consequences of decisions made inside complex systems.</p>
          <p>The right capital will help the work move faster without asking the mission to become ceremonial. If that is how you build, there is a conversation to have.</p>

          <div className="closing-cta">
            <p className="eyebrow">Start the conversation</p>
            <h2>Matthew J Adams<br />Founder, VT Infinite</h2>
            <p>For funding, research, and expert-design partnerships—or to build in public inside the Solve Everything Lab.</p>
            <ContactActions inverse />
          </div>
        </article>
      </section>
    </main>
  );
}
