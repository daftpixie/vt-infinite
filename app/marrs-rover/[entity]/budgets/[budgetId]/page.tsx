import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoCaption, periodPath, PlainMeaning, RoverShell, roverMetadata, StateFields } from "@/components/rover";
import { DEMO_ENTITY_ID, isEnabled } from "@/lib/flags";
import { findBudget, netDisbursed, publications, readable, restrictionLabel } from "@/lib/marrs-rover/explorer";
import { day, formatAmount } from "@/lib/marrs-rover/format";
import { fullSiteOnly } from "@/lib/mode-gate";

type Params = { entity: string; budgetId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  fullSiteOnly();
  const { budgetId } = await params;
  return roverMetadata(`Budget ${budgetId.slice(0, 64)}`, "One synthetic approved budget, its amendments and its variance.");
}

/** Budget (PRD MR-13): approved version, approval, responsible role, restrictions, amendments and variance. */
export default async function BudgetPage({ params }: { params: Promise<Params> }) {
  await connection();
  fullSiteOnly();
  const { entity, budgetId } = await params;
  if (entity !== DEMO_ENTITY_ID && !isEnabled("marrsRoverRealData")) notFound();
  const found = findBudget(publications(), entity, budgetId);
  if (!found) notFound();
  const { bundle: b, budget: g } = found;
  const x = b.currencyExponents;
  const approval = (ref: string) => b.approvals.find((a) => a.approvalRef === ref);
  const first = approval(g.approvalRef);

  return (
    <RoverShell title={`Demo budget ${g.budgetId}`}>
      <p>
        <Link href={periodPath(b)}>Back to period {b.manifest.periodId}</Link>
      </p>
      <h2>The budget</h2>
      <dl className="facts">
        <dt>Program</dt>
        <dd>{readable(g.programId)}</dd>
        <dt>Approved version</dt>
        <dd>Version {g.version}</dd>
        <dt>First approved</dt>
        <dd>
          {day(g.approvedDate)}
          {first ? `: ${first.scope} ${first.role}.` : "."} (<code>{g.approvalRef}</code>)
        </dd>
        <dt>Responsible role</dt>
        <dd>{g.responsibleRole}</dd>
        <dt>Restriction</dt>
        <dd>{restrictionLabel(b, g.restrictionId)}</dd>
        <dt>Variance, in the publication&rsquo;s words</dt>
        <dd>{g.varianceNote}</dd>
      </dl>

      <div className="table-scroll" role="region" aria-label="Budget lines" tabIndex={0}>
        <table>
          <DemoCaption>
            Version {g.version} budget lines against net amounts paid out in {b.manifest.periodId}, computed from the full register ({g.currency}).
          </DemoCaption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="num">
                Budget
              </th>
              <th scope="col" className="num">
                Net paid out
              </th>
              <th scope="col" className="num">
                Remaining
              </th>
            </tr>
          </thead>
          <tbody>
            {g.lines.map((l) => {
              const spent = netDisbursed(b, g.programId, l.categoryId, g.currency);
              const left = BigInt(l.amountMinorUnits) - spent;
              return (
                <tr key={l.categoryId}>
                  <th scope="row">{readable(l.categoryId)}</th>
                  <td className="num">{formatAmount(l.amountMinorUnits, g.currency, x)}</td>
                  <td className="num">{formatAmount(spent, g.currency, x)}</td>
                  <td className="num">{left < 0n ? `over by ${formatAmount(-left, g.currency, x)}` : formatAmount(left, g.currency, x)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Amendments</h2>
      {g.amendments.length === 0 ? (
        <p>This budget has not been amended.</p>
      ) : (
        <ol>
          {g.amendments.map((m) => {
            const a = approval(m.approvalRef);
            return (
              <li key={m.version}>
                Version {m.version}, {day(m.date)}: {m.reason}
                {a ? ` Approved: ${a.scope} ${a.role}.` : ""} (<code>{m.approvalRef}</code>)
              </li>
            );
          })}
        </ol>
      )}
      <p>The publication lists the current version&rsquo;s lines only; earlier versions&rsquo; amounts are not part of this demo bundle.</p>

      <PlainMeaning bundle={b} />
      <StateFields bundle={b} />
    </RoverShell>
  );
}
