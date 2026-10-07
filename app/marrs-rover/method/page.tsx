import Link from "next/link";
import { Placeholder } from "@/components/Placeholder";
import { RoverShell, roverMetadata } from "@/components/rover";

export const metadata = roverMetadata("Marrs Rover method", "Definitions, the proof format and the limits of what a proof shows.");

const TREE = `leaf   = SHA256(0x00 || canonical event bytes)
parent = SHA256(0x01 || left || right)
root   = SHA256(0x02 || uint64_be(leafCount) || top)`;

const TERMS: [string, string][] = [
  ["Entity", "The organization a publication is about. The demo's entity is fictional."],
  ["Reporting period", "The span of dates a publication covers, such as a calendar quarter."],
  ["Cutoff", "The last moment of activity included. Anything later belongs to a later publication or an amendment."],
  ["Cash basis", "Only money that actually moved is counted. It is not a full statement of what an organization owns or owes."],
  ["Receipt and disbursement", "Cash coming in and cash going out. Cash coming in is not always income: loan proceeds are financing."],
  ["Transfer", "Money moved between the entity's own accounts. An internal transfer adds nothing and nets to zero."],
  ["Restricted fund", "Money that may be spent only for a stated purpose. It is part of the cash total, not extra cash, and is tracked on its own."],
  ["Reversal, replacement and reclassification", "How a mistake is corrected: the original stays, a reversal cancels it exactly, a replacement records the right amount, and a reclassification changes the category without moving cash."],
  ["Reconciliation", "Matching the records to bank statements. A publication says how much was matched, and when."],
  ["Exception", "A named, unresolved problem, such as an item not yet matched to a bank statement, with its scope and the role responsible for it."],
  ["Bundle and manifest", "A publication's files, sealed together. The manifest lists every other file with its SHA-256 and size."],
  ["SHA-256 digest", "A 64-character fingerprint of a file's exact bytes. Change one byte and the digest changes completely."],
  ["Merkle root", "One digest that stands for every event in order. Each event can be shown to be included with a short inclusion proof."],
  ["Chain commitment", "Recording a publication's root on a public blockchain, so that a later change would be noticed. The demo has none: its chain commitment is “not attempted”."],
];

/** Method (PRD MR-14, MR-38): definitions, the proof format (ADR 0005) and the limits of proof. */
export default function MarrsRoverMethodPage() {
  return (
    <RoverShell title="Marrs Rover method" current="/marrs-rover/method">
      <p>
        This page explains what a Marrs Rover publication contains, how its proofs are built, and what they can and cannot show. It describes the format of the
        working demo; the rules for publishing real records are still to be set.
      </p>

      <h2>Definitions</h2>
      <dl className="facts">
        {TERMS.map(([t, d]) => (
          <div key={t}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>

      <h2>What a publication contains</h2>
      <p>
        A publication is a folder of files: the manifest, the register of events (as canonical JSON, one event per line, and as a CSV copy for spreadsheets), a
        period summary, a scope statement, the inclusion proofs, the exceptions, the correction history, budgets, public approval references, the schemas, and
        verification instructions. The folder is named for the SHA-256 of its manifest, and the site serves it at that address.
      </p>
      <p>
        Every event is public: a stable ID, a sequence number, dates, a type, an amount in whole minor units (cents, for dollars), the cash movements it makes, its
        program, category and restriction, a plain-language purpose, and references to public approvals. Private details, such as bank account numbers and
        people&rsquo;s names, do not belong in an event: the schemas refuse any field they do not define, and a privacy scan checks every bundle before it is
        sealed. The scan is a release check and a prompt for a person&rsquo;s review, not a guarantee.
      </p>

      <h2>How the proofs work</h2>
      <p>
        Each event is written as canonical JSON (RFC 8785), so the same event always has the same bytes. The events are hashed with SHA-256 into a Merkle tree, in
        the order of their sequence numbers:
      </p>
      <pre className="code-block" tabIndex={0} aria-label="Tree construction">
        <code>{TREE}</code>
      </pre>
      <p>
        The leading byte keeps leaves, inner nodes and the root apart. When a level has an odd number of nodes, the last one moves up unchanged rather than being
        copied. The published root includes the number of events, so a register with rows added or removed cannot give the same root. This format is versioned as
        marrs-rover-merkle.1; a change to it would be a new, named version.
      </p>
      <p>
        An inclusion proof lists, from an event&rsquo;s leaf up to the top, each neighboring digest and the side it sits on. Anyone can follow it from the
        event&rsquo;s bytes to the root. The verifier also checks that the path has exactly the shape the event&rsquo;s position implies.
      </p>

      <h2>How the totals are checked</h2>
      <p>
        Amounts are whole numbers of minor units, added exactly, never as decimals that can round. Different currencies are never added together. For each
        currency, the cash at the end must equal the cash at the start, plus money received, less money paid out, plus reversals and transfers; internal transfers
        must net to zero. Each restricted fund rolls forward the same way, may not go below zero, and together the funds may not exceed the cash that holds them.
        The verifier recomputes every total from the full register and reports arithmetic failures separately from digest failures.
      </p>

      <h2>Corrections</h2>
      <p>
        A sealed publication is not edited in place. A mistake is corrected by adding entries, a reversal and then a replacement or a reclassification, each linked
        to the original, so both the original and the corrected view stay visible. A later amendment is a new publication that names the earlier root and keeps
        every earlier event exactly as it was.
      </p>

      <h2>What a proof does not show</h2>
      <p>
        A matching root shows that the files you examined match their manifest and, once chain commitments exist, a recorded commitment. It shows nothing more. In
        particular, it does not show:
      </p>
      <ul>
        <li>that the source documents are genuine;</li>
        <li>that every account of the organization is included (a count check finds rows missing from a publication, not an account that was never disclosed);</li>
        <li>that amounts are classified correctly;</li>
        <li>that the organization followed the law;</li>
        <li>that anyone benefited;</li>
        <li>that an accountant has examined the books.</li>
      </ul>
      <p>
        The arithmetic checks show internal consistency only. Each of the claims above needs its own evidence and its own stated scope. An independent code check
        of the files is not an accounting audit.
      </p>

      <h2>Disclosure and governance</h2>
      <Placeholder id="roverDisclosurePolicy" />

      <h2>Questions and correction requests</h2>
      <p>
        Questions about a publication, or a request to correct one, go to VT Infinite by email: <Placeholder id="contactEmail" inline />
      </p>
      <p>
        <Link href="/marrs-rover/verify">Check a publication yourself</Link>
      </p>
    </RoverShell>
  );
}
