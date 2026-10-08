import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { DemoCaption, budgetPath, eventPath, filePath, Hash, periodPath, PlainMeaning, reviewPath, RoverShell, roverMetadata, StateFields, Withheld } from "@/components/rover";
import { DEMO_ENTITY_ID, isEnabled } from "@/lib/flags";
import {
  applyFilters,
  bucketLabel,
  CORRECTION_LABELS,
  correctionStatus,
  entities,
  eventMovement,
  filterOptions,
  filterQuery,
  isFiltered,
  netByCurrency,
  netDisbursed,
  PAGE_SIZE,
  parseFilters,
  periodBundles,
  periodFailures,
  periods,
  publications,
  readable,
  restrictionLabel,
  TYPE_LABELS,
  type RegisterFilters,
} from "@/lib/marrs-rover/explorer";
import { day, formatAmount, formatMovement, formatSigned } from "@/lib/marrs-rover/format";
import type { LoadedBundle } from "@/lib/marrs-rover/types";

type Params = { entity: string; period: string };
type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { period } = await params;
  return roverMetadata(`Period ${period.slice(0, 16)}`, "Balances, register, restrictions and status for one synthetic reporting period.");
}

/** Reporting period (PRD MR-10, MR-11): balances, budgets, reconciliation, exceptions, corrections, register and files. */
export default async function PeriodPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Query> }) {
  await connection();
  const { entity, period } = await params;
  // Real entities need their flag, and even then this stage serves only the demo.
  if (entity !== DEMO_ENTITY_ID && !isEnabled("marrsRoverRealData")) notFound();
  const query = await searchParams;
  const pubs = publications();

  // The no-JavaScript filter form can change entity or period; move to that path, keeping the other filters.
  const wantEntity = one(query.entity);
  const wantPeriod = one(query.period);
  if ((wantEntity && wantEntity !== entity) || (wantPeriod && wantPeriod !== period)) {
    const e = entities(pubs).includes(wantEntity) ? wantEntity : entity;
    const p = periods(pubs, e).includes(wantPeriod) ? wantPeriod : (periods(pubs, e)[0] ?? period);
    const rest = Object.fromEntries(Object.entries(query).filter(([k]) => k !== "entity" && k !== "period" && k !== "page"));
    const qs = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, one(v)]) as [string, string][]).toString();
    redirect(`/marrs-rover/${e}/periods/${p}${qs ? `?${qs}` : ""}`);
  }

  const bundles = periodBundles(pubs, entity, period);
  const failures = periodFailures(pubs, entity, period);
  const b = bundles[0];
  if (!b) {
    if (failures.length === 0) notFound();
    return (
      <RoverShell title={`Demo period ${period}`}>
        <Withheld failures={failures} />
        <p>
          <Link href="/marrs-rover">Back to the overview</Link>
        </p>
      </RoverShell>
    );
  }

  const f = parseFilters(b, query);
  return (
    <RoverShell title={`Demo period ${period}`}>
      <Withheld failures={failures} />
      <PlainMeaning bundle={b} />
      <StateFields bundle={b} />
      <Balances b={b} />
      <Budgets b={b} />
      <Issues b={b} />
      <Corrections b={b} />
      <h2>Independent review</h2>
      <p>
        Not examined. <Link href={reviewPath(b)}>What the review record says for {b.manifest.periodId}</Link>
      </p>
      <Register b={b} f={f} pubs={{ entities: entities(pubs), periods: periods(pubs, entity) }} />
      <Files b={b} />
      <ProofDetails b={b} />
      {bundles.length > 1 ? (
        <>
          <h2>Earlier publications of this period</h2>
          <ul>
            {bundles.slice(1).map((x) => (
              <li key={x.digest}>
                Commitment sequence {x.manifest.commitmentSequence}, manifest SHA-256 <Hash value={x.digest} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </RoverShell>
  );
}

function Balances({ b }: { b: LoadedBundle }) {
  const x = b.currencyExponents;
  return (
    <section aria-labelledby="balances">
      <h2 id="balances">Balances</h2>
      <div className="table-scroll" role="region" aria-label="Balances by cash bucket" tabIndex={0}>
        <table>
          <DemoCaption>Opening and closing cash for each synthetic cash bucket, {b.manifest.periodId}.</DemoCaption>
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              <th scope="col">Currency</th>
              <th scope="col" className="num">
                Opening
              </th>
              <th scope="col" className="num">
                Closing
              </th>
            </tr>
          </thead>
          <tbody>
            {b.summary.buckets.map((k) => (
              <tr key={k.bucketId}>
                <th scope="row">{bucketLabel(b, k.bucketId)}</th>
                <td>{k.currency}</td>
                <td className="num">{formatSigned(k.opening, k.currency, x)}</td>
                <td className="num">{formatSigned(k.closing, k.currency, x)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Restricted funds</h3>
      <div className="table-scroll" role="region" aria-label="Restricted funds" tabIndex={0}>
        <table>
          <DemoCaption>Each restricted fund rolled forward on its own. A restriction is part of the cash above, not extra cash.</DemoCaption>
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col" className="num">
                Opening
              </th>
              <th scope="col" className="num">
                Received
              </th>
              <th scope="col" className="num">
                Paid out
              </th>
              <th scope="col" className="num">
                Reversals, net
              </th>
              <th scope="col" className="num">
                Closing
              </th>
            </tr>
          </thead>
          <tbody>
            {b.summary.restrictedFunds.map((r) => (
              <tr key={`${r.restrictionId}-${r.currency}`}>
                <th scope="row">{restrictionLabel(b, r.restrictionId)}</th>
                <td className="num">{formatSigned(r.opening, r.currency, x)}</td>
                <td className="num">{formatAmount(r.receipts, r.currency, x)}</td>
                <td className="num">{formatAmount(r.disbursements, r.currency, x)}</td>
                <td className="num">{formatMovement(r.reversalsNet, r.currency, x)}</td>
                <td className="num">{formatSigned(r.closing, r.currency, x)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Budgets({ b }: { b: LoadedBundle }) {
  const x = b.currencyExponents;
  if (b.budgets.length === 0) return null;
  return (
    <section aria-labelledby="budgets">
      <h2 id="budgets">Budgets compared with spending</h2>
      <p>
        &ldquo;Net paid out&rdquo; is computed here from the full register: disbursements for the program and category, less any reversals of them. The variance notes
        are the publication&rsquo;s own words.
      </p>
      <div className="table-scroll" role="region" aria-label="Budgets compared with spending" tabIndex={0}>
        <table>
          <DemoCaption>Approved budget lines against net amounts paid out, {b.manifest.periodId}.</DemoCaption>
          <thead>
            <tr>
              <th scope="col">Budget and line</th>
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
            {b.budgets.flatMap((g) =>
              g.lines.map((l) => {
                const spent = netDisbursed(b, g.programId, l.categoryId, g.currency);
                const left = BigInt(l.amountMinorUnits) - spent;
                return (
                  <tr key={`${g.budgetId}-${l.categoryId}`}>
                    <th scope="row">
                      <Link href={budgetPath(b, g.budgetId)}>{g.budgetId}</Link>, {readable(l.categoryId)}
                    </th>
                    <td className="num">{formatAmount(l.amountMinorUnits, g.currency, x)}</td>
                    <td className="num">{formatAmount(spent, g.currency, x)}</td>
                    <td className="num">{left < 0n ? `over by ${formatAmount(-left, g.currency, x)}` : formatAmount(left, g.currency, x)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Issues({ b }: { b: LoadedBundle }) {
  const rec = b.scope.reconciliation;
  return (
    <section aria-labelledby="reconciliation">
      <h2 id="reconciliation">Reconciliation and exceptions</h2>
      <p>
        Reconciliation date: {rec.date ? day(rec.date) : "none stated"}. {rec.coverage}
      </p>
      {b.exceptions.exceptions.length === 0 ? (
        <p>No exceptions are disclosed for this period.</p>
      ) : (
        <ul>
          {b.exceptions.exceptions.map((e) => (
            <li key={e.exceptionId}>
              <strong>{e.status === "open" ? "Open" : "Resolved"}</strong> ({e.exceptionId}, {readable(e.kind)}): {e.description} Scope: {e.scope} Owner: {e.ownerRole}.
              Opened {day(e.openedDate)}.{e.resolutionRef ? ` Resolution: ${e.resolutionRef}.` : " No resolution yet."}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Corrections({ b }: { b: LoadedBundle }) {
  if (b.corrections.length === 0) return null;
  const purpose = (id: string) => b.events.find((e) => e.eventId === id)?.purpose.text ?? id;
  return (
    <section aria-labelledby="corrections">
      <h2 id="corrections">Corrections</h2>
      <p>Nothing is overwritten. A mistake stays in the register, followed by the entries that correct it.</p>
      {b.corrections.map((c) => (
        <div key={c.originalEventId} className="corrections">
          <p>
            Original: <Link href={eventPath(b, c.originalEventId)}>{purpose(c.originalEventId)}</Link>
          </p>
          <ol>
            {c.correctingEvents.map((k) => (
              <li key={k.eventId}>
                {k.kind === "reversal" ? "Reversed by" : k.kind === "replacement" ? "Replaced by" : "Reclassified by"}{" "}
                <Link href={eventPath(b, k.eventId)}>{purpose(k.eventId)}</Link> Reason: {k.reason}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function Select({ id, label, value, options, all, text = readable }: { id: string; label: string; value: string; options: string[]; all: string; text?: (v: string) => string }) {
  return (
    <div className="field">
      <label htmlFor={`f-${id}`}>{label}</label>
      <select id={`f-${id}`} name={id} defaultValue={value}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {text(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Register({ b, f, pubs }: { b: LoadedBundle; f: RegisterFilters; pubs: { entities: string[]; periods: string[] } }) {
  const x = b.currencyExponents;
  const opts = filterOptions(b);
  const matching = applyFilters(b, f);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = isFiltered(f);
  const totals = netByCurrency(matching);
  const here = periodPath(b);
  const csv = b.files.find((file) => file.path === "register.csv");
  return (
    <section aria-labelledby="register">
      <h2 id="register">Register</h2>
      <p>
        Every event in the publication, in the order it was published. Filters change this view only; the published register and the totals above always cover all{" "}
        {b.events.length} events.
        {csv ? (
          <>
            {" "}
            <a href={filePath(b, csv.path)} download>
              Download the full register as CSV
            </a>
            .
          </>
        ) : null}
      </p>
      <form method="get" action={here} className="filters" aria-label="Filter the register">
        <Select id="entity" label="Entity" value={b.manifest.entityId} options={pubs.entities} all="Any entity" text={(e) => (e === "demo" ? "Synthetic demo entity (fictional)" : e)} />
        <Select id="period" label="Period" value={b.manifest.periodId} options={pubs.periods} all="Latest period" text={(p) => p} />
        <Select id="program" label="Program" value={f.program} options={opts.program} all="All programs" />
        <Select id="category" label="Category" value={f.category} options={opts.category} all="All categories" />
        <Select id="currency" label="Currency" value={f.currency} options={opts.currency} all="All currencies" text={(c) => c} />
        <Select id="restriction" label="Restriction" value={f.restriction} options={opts.restriction} all="Any restriction" text={(r) => (r === "unrestricted" ? "Unrestricted" : restrictionLabel(b, r))} />
        <Select id="type" label="Event type" value={f.type} options={opts.type} all="All event types" text={(t) => TYPE_LABELS[t as keyof typeof TYPE_LABELS] ?? t} />
        <Select
          id="correction"
          label="Correction status"
          value={f.correction}
          options={["corrected", "correcting", "none"]}
          all="Any correction status"
          text={(c) => CORRECTION_LABELS[c as keyof typeof CORRECTION_LABELS]}
        />
        <div className="field">
          <label htmlFor="f-q">Search public IDs and descriptions</label>
          <input id="f-q" name="q" type="search" defaultValue={f.q} maxLength={100} />
        </div>
        <button type="submit" className="button">
          Apply filters
        </button>
        {filtered ? <Link href={`${here}#register`}>Clear filters</Link> : null}
      </form>
      <p className="notice-inline">
        There is no exception filter here. Exceptions are disclosed for a scope, not linked to single events, and they are listed under{" "}
        <a href="#reconciliation">Reconciliation and exceptions</a>.
      </p>

      <p role="status">
        {filtered ? `${matching.length} of ${b.events.length} events match the filters.` : `All ${b.events.length} events.`}{" "}
        {matching.length > 0
          ? `Net cash movement of ${filtered ? "the matching events only" : "every event"}: ${[...totals].map(([c, n]) => `${formatMovement(n, c, x)} (${c})`).join("; ")}.`
          : ""}
        {filtered ? " This figure covers the filtered events, not the period." : ""}
      </p>

      {shown.length === 0 ? (
        <p>No event matches these filters.</p>
      ) : (
        <div className="table-scroll" role="region" aria-label="Register table" tabIndex={0}>
          <table>
            <DemoCaption>
              Register, {b.manifest.periodId}: events {(page - 1) * PAGE_SIZE + 1} to {(page - 1) * PAGE_SIZE + shown.length} of {matching.length}
              {filtered ? " matching the filters" : ""}.
            </DemoCaption>
            <thead>
              <tr>
                <th scope="col" className="num">
                  No.
                </th>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col">Purpose</th>
                <th scope="col">Program and category</th>
                <th scope="col">Restriction</th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col" className="num">
                  Cash movement
                </th>
                <th scope="col">Correction</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.eventId}>
                  <td className="num">{e.eventSequence}</td>
                  <td>{day(e.effectiveDate)}</td>
                  <td>{TYPE_LABELS[e.type]}</td>
                  <th scope="row">
                    <Link href={eventPath(b, e.eventId)}>{e.purpose.text}</Link>
                  </th>
                  <td>
                    {readable(e.programId)}; {readable(e.classification.categoryId)}
                  </td>
                  <td>{restrictionLabel(b, e.classification.restrictionId)}</td>
                  <td className="num">{e.amountMinorUnits && e.currency ? formatAmount(e.amountMinorUnits, e.currency, x) : "none"}</td>
                  <td className="num">{eventMovement(e, x)}</td>
                  <td>{CORRECTION_LABELS[correctionStatus(b, e)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Register pages">
          <ul className="filter-list">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <li key={n}>
                <Link href={`${here}${filterQuery({ ...f, page: n })}#register`} aria-current={n === page ? "page" : undefined}>
                  Page {n}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}

function Files({ b }: { b: LoadedBundle }) {
  return (
    <section aria-labelledby="files">
      <h2 id="files">Download this publication</h2>
      <p>
        Every file of the sealed bundle, byte for byte as published, at an address named for the manifest&rsquo;s SHA-256. Each file carries the demo label. Check a
        file by computing its SHA-256 and comparing it with the value beside it; the <Link href="/marrs-rover/verify">Verify page</Link> shows how.
      </p>
      <div className="table-scroll" role="region" aria-label="Files of this publication" tabIndex={0}>
        <table>
          <DemoCaption>Files of the {b.manifest.periodId} demo publication, with their SHA-256 digests and sizes.</DemoCaption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">What it is</th>
              <th scope="col">SHA-256</th>
              <th scope="col" className="num">
                Size (bytes)
              </th>
            </tr>
          </thead>
          <tbody>
            {b.files.map((file) => (
              <tr key={file.path}>
                <th scope="row">
                  <a href={filePath(b, file.path)} download>
                    {file.path}
                  </a>
                </th>
                <td>{readable(file.role)}</td>
                <td>
                  <Hash value={file.sha256} />
                </td>
                <td className="num">{file.bytes.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProofDetails({ b }: { b: LoadedBundle }) {
  return (
    <section aria-labelledby="proof">
      <h2 id="proof">Proof details</h2>
      <dl className="facts">
        <dt>Manifest SHA-256 (this publication&rsquo;s address)</dt>
        <dd>
          <Hash value={b.digest} />
        </dd>
        <dt>Published root</dt>
        <dd>
          <Hash value={b.manifest.events.root} />
        </dd>
        <dt>Events committed</dt>
        <dd>{b.manifest.events.count}</dd>
        <dt>Method</dt>
        <dd>
          {b.manifest.versions.merkle}, {b.manifest.versions.hash}, {b.manifest.versions.canonicalization} canonical JSON. <Link href="/marrs-rover/method">How it works</Link>
        </dd>
        <dt>Prior root</dt>
        <dd>{b.manifest.priorRoot ? <Hash value={b.manifest.priorRoot} /> : "None: this is the entity's first publication."}</dd>
      </dl>
    </section>
  );
}
