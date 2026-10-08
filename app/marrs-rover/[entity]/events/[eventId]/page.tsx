import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoCaption, eventPath, Hash, periodPath, PlainMeaning, RoverShell, roverMetadata, StateFields } from "@/components/rover";
import { DEMO_ENTITY_ID, isEnabled } from "@/lib/flags";
import {
  bucketLabel,
  CORRECTION_LABELS,
  correctionStatus,
  eventMovement,
  findEvent,
  FLOW_LABELS,
  publications,
  readable,
  restrictionLabel,
  TYPE_LABELS,
} from "@/lib/marrs-rover/explorer";
import { day, formatAmount, formatMovement, utcTime } from "@/lib/marrs-rover/format";

type Params = { entity: string; eventId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { eventId } = await params;
  return roverMetadata(`Event ${eventId.slice(0, 8)}`, "One synthetic financial event, its purpose, approvals, corrections and inclusion proof.");
}

/** Financial event (PRD MR-12). */
export default async function EventPage({ params }: { params: Promise<Params> }) {
  await connection();
  const { entity, eventId } = await params;
  if (entity !== DEMO_ENTITY_ID && !isEnabled("marrsRoverRealData")) notFound();
  const found = findEvent(publications(), entity, eventId);
  if (!found) notFound();
  const { bundle: b, event: e, index } = found;
  const x = b.currencyExponents;
  const proof = b.proofs.proofs[index];
  const approvals = (refs: string[]) => refs.map((r) => ({ ref: r, a: b.approvals.find((a) => a.approvalRef === r) }));
  const history = e.correction ? b.corrections.find((c) => c.originalEventId === e.correction?.originalEventId) : b.corrections.find((c) => c.originalEventId === e.eventId);
  const purpose = (id: string) => b.events.find((v) => v.eventId === id)?.purpose.text ?? id;

  return (
    <RoverShell title={`Demo event ${e.eventSequence} of ${b.manifest.periodId}`}>
      <p>
        <Link href={periodPath(b)}>Back to period {b.manifest.periodId}</Link>
      </p>
      <h2>What happened</h2>
      <dl className="facts">
        <dt>Purpose</dt>
        <dd>{e.purpose.text}{e.purpose.redactionReason ? ` (Redacted: ${e.purpose.redactionReason}.)` : ""}</dd>
        <dt>Type</dt>
        <dd>{TYPE_LABELS[e.type]}</dd>
        <dt>Amount</dt>
        <dd>{e.amountMinorUnits && e.currency ? `${formatAmount(e.amountMinorUnits, e.currency, x)} (${e.currency})` : "None: this event moves no cash."}</dd>
        <dt>Cash movement</dt>
        <dd>{eventMovement(e, x)}</dd>
        <dt>Effective date</dt>
        <dd>{day(e.effectiveDate)}</dd>
        <dt>Published</dt>
        <dd>{utcTime(e.publishedAt)}</dd>
        <dt>Program</dt>
        <dd>{readable(e.programId)}</dd>
        <dt>Category</dt>
        <dd>
          {readable(e.classification.categoryId)} (category list version {e.classification.categoryVersion}); {FLOW_LABELS[e.classification.flow]}
        </dd>
        <dt>Restriction</dt>
        <dd>{restrictionLabel(b, e.classification.restrictionId)}</dd>
        <dt>Public event ID</dt>
        <dd>
          <code>{e.eventId}</code>, number {e.eventSequence} in the register
        </dd>
      </dl>

      {e.cashLegs.length ? (
        <div className="table-scroll" role="region" aria-label="Cash legs" tabIndex={0}>
          <table>
            <DemoCaption>The cash movements that make up this event.</DemoCaption>
            <thead>
              <tr>
                <th scope="col">Bucket</th>
                <th scope="col">Kind</th>
                <th scope="col" className="num">
                  Movement
                </th>
              </tr>
            </thead>
            <tbody>
              {e.cashLegs.map((l) => (
                <tr key={l.legId}>
                  <th scope="row">{bucketLabel(b, l.bucketId)}</th>
                  <td>{l.boundary === "external" ? "To or from outside the entity" : l.boundary === "internal" ? "Between the entity's own buckets" : "Across the scope boundary"}</td>
                  <td className="num">{formatMovement(l.deltaMinorUnits, l.currency, x)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2>Approvals and conflicts</h2>
      {e.controls.approvalRefs.length === 0 ? (
        <p>No public approval reference is recorded for this event. That is a stated gap, not a hidden one.</p>
      ) : (
        <ul>
          {approvals(e.controls.approvalRefs).map(({ ref, a }) => (
            <li key={ref}>
              {a ? `${a.scope} ${a.role}, ${day(a.date)}.` : "Approval record not found in this publication."} (<code>{ref}</code>)
            </li>
          ))}
        </ul>
      )}
      {e.controls.conflictRefs.length === 0 ? (
        <p>No conflict disclosure is linked to this event.</p>
      ) : (
        <ul>
          {approvals(e.controls.conflictRefs).map(({ ref, a }) => (
            <li key={ref}>
              Conflict disclosure: {a ? `${a.scope} ${a.role}, ${day(a.date)}.` : "record not found in this publication."} (<code>{ref}</code>)
            </li>
          ))}
        </ul>
      )}

      <h2>Corrections</h2>
      <p>{CORRECTION_LABELS[correctionStatus(b, e)]}.</p>
      {history ? (
        <ol>
          <li>
            Original entry: <Link href={eventPath(b, history.originalEventId)}>{purpose(history.originalEventId)}</Link>
            {history.originalEventId === e.eventId ? " (this event)" : ""}
          </li>
          {history.correctingEvents.map((k) => (
            <li key={k.eventId}>
              {k.kind === "reversal" ? "Reversal" : k.kind === "replacement" ? "Replacement" : "Reclassification"}:{" "}
              <Link href={eventPath(b, k.eventId)}>{purpose(k.eventId)}</Link>
              {k.eventId === e.eventId ? " (this event)" : ""} Reason: {k.reason}
            </li>
          ))}
        </ol>
      ) : null}

      <h2>Reports and chain</h2>
      <p>
        {e.evidence.reportRefs.length ? `Report references: ${e.evidence.reportRefs.join(", ")}.` : "No independent report applies to this event."} No payment on any
        blockchain is linked to it: this is a record of a synthetic bank movement, and its publication has not been committed to a chain either.
      </p>

      <PlainMeaning bundle={b} />
      <StateFields bundle={b} />

      <h2>Inclusion proof</h2>
      <p>
        These values let anyone check that this event&rsquo;s exact bytes are one of the {b.manifest.events.count} events under the published root, without trusting
        this page.
      </p>
      {proof ? (
        <dl className="facts">
          <dt>Leaf position</dt>
          <dd>
            {proof.leafIndex} (counting from 0) of {b.proofs.leafCount}
          </dd>
          <dt>Leaf digest</dt>
          <dd>
            <Hash value={proof.leaf} />
          </dd>
          <dt>Path, from the leaf up</dt>
          <dd>
            <ol>
              {proof.path.map((s, i) => (
                <li key={i}>
                  Sibling on the {s.side}: <Hash value={s.hash} />
                </li>
              ))}
            </ol>
          </dd>
          <dt>Published root</dt>
          <dd>
            <Hash value={b.proofs.root} />
          </dd>
        </dl>
      ) : null}
    </RoverShell>
  );
}
