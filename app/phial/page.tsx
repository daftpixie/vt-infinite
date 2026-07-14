import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components";

export const metadata: Metadata = { title: "Phial", description: "The open, model-optional operating system for audit-ready health economic research." };

export default function PhialPage() {
  return (
    <main>
      <Header />
      <section className="page-hero shell">
        <p className="eyebrow">Phial / Health economics</p>
        <h1>Make the work faster.<br />Keep the judgment human.</h1>
        <p className="lede">Phial is the open, model-optional operating system for audit-ready health economic research.</p>
      </section>
      <section className="page-grid shell">
        <aside>
          <p>Product status<br />MVP specification</p>
          <img className="inline-mark" src="/phial-mark.jpg" alt="Phial mark: a bounded geometric vessel containing a lattice of connected paths" width={1024} height={1024} />
        </aside>
        <article className="prose">
          <h2>The problem</h2>
          <p>Health-economic research is fragmented across literature tools, spreadsheets, statistical software, modeling engines, repositories, and manual review. The most consequential decisions often disappear between them: why one source was chosen, whether a comparator is current, where a parameter came from, or whether a conclusion still matches the latest run.</p>
          <p>Reproducibility is necessary. It is not sufficient. A model can perform the same operation perfectly every time and still be built on the wrong specification.</p>
          <blockquote>Reproducibility tells you the machine did the same thing twice. Validation asks whether it should have done that thing at all.</blockquote>

          <h2>The product</h2>
          <p>Phial connects the full path from decision question to review-ready analysis. Bounded agents assist with evidence and implementation. Deterministic tools perform calculations. Immutable artifacts preserve the record. Human experts approve every consequential scientific choice.</p>
          <div className="facts">
            <article><span>Evidence compiler</span><strong>Scope → sources → parameter registry</strong></article>
            <article><span>Model compiler</span><strong>Specification → executable analysis</strong></article>
            <article><span>Validation system</span><strong>Implementation + structural challenge</strong></article>
            <article><span>Review package</span><strong>Claims → provenance → publication artifacts</strong></article>
          </div>

          <h2>The first wedge</h2>
          <p>Phial begins where trust is easiest to test and most valuable: independent model validation and model refresh under new evidence, prices, or comparators. The initial market is United States Medicare-perspective health-economic research using aggregate and public data.</p>
          <p>The CHAMPION-AF workflow is the first benchmark. It has already exercised the loop Phial must productize: scope, evidence, modeling, adversarial review, material correction, numeric quality control, and publication packaging.</p>

          <h2>Why the name</h2>
          <p>A phial is a vessel. Evidence enters fragmented; governed structure makes it legible. The boundary is human control. The lattice within it is the interdependent record of sources, parameters, assumptions, calculations, approvals, and claims.</p>
          <p>The deeper reference is the Phial of Galadriel: light carried into darkness when the road can no longer be seen. It does not carry the burden for the person holding it. It gives them enough light to continue.</p>
          <blockquote>The tool is not the hero. The person carrying it is.</blockquote>

          <h2>The founder mandate</h2>
          <ul>
            <li>Agents assist.</li>
            <li>Deterministic tools calculate.</li>
            <li>Humans approve every consequential scientific decision.</li>
            <li>Independent validation challenges implementation and specification.</li>
            <li>Artifacts—not conversations—are the source of truth.</li>
            <li>No result outranks the integrity of the process that produced it.</li>
          </ul>

          <div className="closing-cta">
            <p className="eyebrow">Build with us</p>
            <h2>Trust will be infrastructure.</h2>
            <p>VT Infinite is opening conversations with aligned funding, research, and design partners.</p>
            <Link className="button button-inverse" href="/partners">Partner with VT Infinite</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
