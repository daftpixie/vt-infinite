import Link from "next/link";
import { connection } from "next/server";
import { Placeholder } from "@/components/Placeholder";
import { periodPath, PlainMeaning, reviewPath, RoverShell, roverMetadata, StateFields, Withheld } from "@/components/rover";
import { defaultSelection, entities, periodBundles, periods, publications } from "@/lib/marrs-rover/explorer";
import { fullSiteOnly } from "@/lib/mode-gate";

export const metadata = roverMetadata("Marrs Rover Block Explorer", "Overview of the synthetic demo publication.");

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Overview (PRD MR-9): environment, entity, cutoff, scope, basis, publication date and separate evidence states. */
export default async function MarrsRoverPage({ searchParams }: { searchParams: Promise<Query> }) {
  await connection();
  fullSiteOnly();
  const query = await searchParams;
  const pubs = publications();
  const fallback = defaultSelection(pubs);
  const entityOptions = entities(pubs);
  const entityId = entityOptions.includes(one(query.entity)) ? one(query.entity) : (fallback?.entityId ?? "");
  const periodOptions = entityId ? periods(pubs, entityId) : [];
  const periodId = periodOptions.includes(one(query.period)) ? one(query.period) : (periodOptions[0] ?? "");
  const bundle = entityId && periodId ? periodBundles(pubs, entityId, periodId)[0] : undefined;

  return (
    <RoverShell title="Marrs Rover Block Explorer" current="/marrs-rover">
      <Placeholder id="roverIntro" />
      <Placeholder id="roverAttribution" />
      <Withheld failures={pubs.failed} />

      <h2>Choose what to look at</h2>
      {entityOptions.length === 0 ? (
        <p>No demo publication can be shown at the moment.</p>
      ) : (
        <form method="get" action="/marrs-rover" className="filters">
          <div className="field">
            <label htmlFor="entity">Entity</label>
            <select id="entity" name="entity" defaultValue={entityId}>
              {entityOptions.map((e) => (
                <option key={e} value={e}>
                  {e === "demo" ? "Synthetic demo entity (fictional)" : e}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="period">Reporting period</label>
            <select id="period" name="period" defaultValue={periodId}>
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button">
            Show this period
          </button>
        </form>
      )}

      {bundle ? (
        <>
          <h2>
            {bundle.scope.entityLabel}, {bundle.manifest.periodId}
          </h2>
          <ul className="filter-list">
            <li>
              <Link href={periodPath(bundle)}>Open the period, its register and its files</Link>
            </li>
            <li>
              <Link href={reviewPath(bundle)}>Independent review status</Link>
            </li>
          </ul>
          <PlainMeaning bundle={bundle} headingLevel={3} />
          <StateFields bundle={bundle} headingLevel={3} />
        </>
      ) : null}
    </RoverShell>
  );
}
