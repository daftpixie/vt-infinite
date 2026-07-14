import Link from "next/link";
import { Footer, Header } from "./components";

const principles = [
  { number: "01", title: "Agents assist.", text: "Frontier models accelerate the work. They do not become the final authority." },
  { number: "02", title: "Tools calculate.", text: "Deterministic systems perform the math. Every material transformation remains traceable." },
  { number: "03", title: "Humans decide.", text: "Consequential judgment stays with the people who understand the evidence and carry the responsibility." }
];

export default function Home() {
  return (
    <main>
      <Header />
      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Intelligence, conducted.</p>
          <h1>Vigilance,<br />made operational.</h1>
          <p className="lede">VT Infinite conducts frontier AI, deterministic tools, and human judgment into systems built for consequential questions.</p>
          <div className="actions">
            <Link className="button button-solid" href="/phial">Meet Phial</Link>
            <Link className="button" href="/origin">Why VT Infinite exists</Link>
          </div>
          <p className="status-line"><span aria-hidden="true" /> Current focus: audit-ready health economic research</p>
        </div>
        <div className="hero-mark" aria-label="VT Infinite mark: vigilance held within the infinite beneath a protective roof">
          <img src="/vt-infinite-mark.jpg" alt="VT Infinite mark: a V held within a circle beneath two lines forming a roof" width={1024} height={1024} />
        </div>
      </section>

      <section className="manifesto shell section-rule">
        <p className="eyebrow">The premise</p>
        <h2>When the question matters, the answer must survive the asking.</h2>
        <p>Powerful systems should be measured against the outcomes of the humans they exist to serve. That requires visible assumptions, auditable decisions, and human control at every consequential gate.</p>
      </section>

      <section className="principles shell" aria-label="VT Infinite operating principles">
        {principles.map((principle) => (
          <article key={principle.number}>
            <span>{principle.number}</span>
            <h3>{principle.title}</h3>
            <p>{principle.text}</p>
          </article>
        ))}
      </section>

      <section className="product-band">
        <div className="shell product-grid">
          <div className="product-mark">
            <img src="/phial-mark.jpg" alt="Phial mark: a bounded geometric vessel containing a lattice of connected paths" width={1024} height={1024} />
          </div>
          <div className="product-copy">
            <p className="eyebrow">Introducing Phial</p>
            <h2>From evidence to model.<br />Without losing the truth between.</h2>
            <p>Phial is the open, model-optional operating system for audit-ready health economic research. It turns fragmented evidence into a governed path through specification, execution, validation, and review.</p>
            <p className="founder-mandate">Agents assist. Deterministic tools calculate. Humans decide.</p>
            <Link className="text-link" href="/phial">Explore the product <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="proof shell section-rule">
        <div>
          <p className="eyebrow">Proof before promises</p>
          <h2>The method came before the product.</h2>
        </div>
        <div>
          <p>Phial emerged from an independent health-economic workflow built around CHAMPION-AF: evidence acquisition, model construction, adversarial review, correction, and full regeneration without overwriting the record.</p>
          <p>The current paper is being rebuilt after consensus review and will be released through GitHub and Zenodo for expert review. The benchmark becomes the first test of the system it inspired.</p>
        </div>
      </section>

      <section className="partner-call shell">
        <p className="eyebrow">For aligned funding partners</p>
        <h2>Fund the discipline between frontier capability and consequential decisions.</h2>
        <p>VT Infinite is opening conversations with partners who understand that trust will be infrastructure—and that the strongest AI systems will make expert judgment more powerful, not ceremonial.</p>
        <Link className="button button-inverse" href="/partners">The investment case</Link>
      </section>
      <Footer />
    </main>
  );
}
