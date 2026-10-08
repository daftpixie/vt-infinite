import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_LABEL } from "@/packages/ledger-proof/src/constants.ts";
import { PageShell } from "@/components/PageShell";
import {
  ENVIRONMENT_LABELS,
  RECONCILIATION_LABELS,
  readable,
  restrictionLabel,
} from "@/lib/marrs-rover/explorer";
import { day, formatAmount, formatMovement, formatSigned, utcTime } from "@/lib/marrs-rover/format";
import type { FailedBundle, LoadedBundle } from "@/lib/marrs-rover/types";

/**
 * Shared parts of the Marrs Rover explorer (PRD §12). Every page carries
 * the MR-5 demo label in its body and in its metadata, states the plain
 * meaning before any proof detail (MR-4), and shows each evidence state on
 * its own line (MR-46), never as one "verified" badge.
 */
export { DEMO_LABEL };

export function roverMetadata(title: string, description?: string): Metadata {
  const full = description ? `${DEMO_LABEL} ${description}` : DEMO_LABEL;
  return { title: `${title} (demo)`, description: full, other: { "marrs-rover-environment": "synthetic-demo" } };
}

/** Every table caption carries the full MR-5 label (ADR 0005), after its own description. */
export function DemoCaption({ children }: { children: ReactNode }) {
  return (
    <caption>
      {children} <span data-demo-label>{DEMO_LABEL}</span>
    </caption>
  );
}

export function DemoLabel() {
  return (
    <div className="notice demo-label" role="note" aria-label="Demo data">
      <p>
        <strong>{DEMO_LABEL}</strong>
      </p>
      <p>
        Everything in the Marrs Rover explorer is a synthetic sample for a fictional organization in the year 2000. It shows how Marrs Rover will present
        records; it says nothing about VT Infinite&rsquo;s money.
      </p>
    </div>
  );
}

const ROVER_LINKS = [
  { href: "/marrs-rover", label: "Overview" },
  { href: "/marrs-rover/verify", label: "Verify" },
  { href: "/marrs-rover/method", label: "Method" },
];

export function RoverShell({ title, current, children }: { title: string; current?: string; children?: ReactNode }) {
  return (
    <PageShell title={title}>
      <DemoLabel />
      <nav aria-label="Marrs Rover">
        <ul className="filter-list">
          {ROVER_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={current === l.href ? "page" : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </PageShell>
  );
}

/** A publication that failed a check is withheld, and the page says so in plain words. */
export function Withheld({ failures }: { failures: FailedBundle[] }) {
  if (failures.length === 0) return null;
  return (
    <div className="notice" role="note" aria-label="Withheld publication" data-withheld>
      <p className="label">Publication withheld</p>
      {failures.map((f) => (
        <p key={f.digest}>
          A demo publication for {f.entityId}, {f.periodId} is not shown. {f.reason} The site never displays a publication whose files fail their checks.
        </p>
      ))}
    </div>
  );
}

export const periodPath = (b: LoadedBundle) => `/marrs-rover/${b.manifest.entityId}/periods/${b.manifest.periodId}`;
export const reviewPath = (b: LoadedBundle) => `/marrs-rover/reviews/${b.manifest.entityId}-${b.manifest.periodId}`;
export const eventPath = (b: LoadedBundle, eventId: string) => `/marrs-rover/${b.manifest.entityId}/events/${eventId}`;
export const budgetPath = (b: LoadedBundle, budgetId: string) => `/marrs-rover/${b.manifest.entityId}/budgets/${budgetId}`;
export const filePath = (b: LoadedBundle, file: string) => `/marrs-rover/${b.manifest.entityId}/bundles/${b.digest}/${file}`;

/** Plain meaning first (MR-4): what this is, what it covers, where the money went, and what is unresolved. */
export function PlainMeaning({ bundle: b, headingLevel = 2 }: { bundle: LoadedBundle; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2";
  const H2 = `h${headingLevel + 1}` as "h3";
  const x = b.currencyExponents;
  const open = b.exceptions.exceptions.filter((e) => e.status === "open");
  return (
    <section aria-labelledby="plain-meaning">
      <H id="plain-meaning">In plain words</H>
      <dl className="facts">
        <dt>Entity</dt>
        <dd>{b.scope.entityLabel}</dd>
        <dt>Reporting period</dt>
        <dd>
          {day(b.scope.periodStart)}–{day(b.scope.periodEnd)} ({b.manifest.periodId})
        </dd>
        <dt>Cutoff</dt>
        <dd>{utcTime(b.scope.cutoff)}</dd>
        <dt>Financial basis</dt>
        <dd>Cash activity only. {b.scope.statement}</dd>
        <dt>Coverage</dt>
        <dd>
          {b.scope.buckets.map((k) => k.label).join("; ")}.{" "}
          {b.scope.excluded.map((e) => `${e.description} ${e.reason}`).join(" ")}
        </dd>
        <dt>Restrictions</dt>
        <dd>
          {b.summary.restrictedFunds.length === 0
            ? "No restricted funds."
            : `${b.summary.restrictedFunds
                .map((f) => `${restrictionLabel(b, f.restrictionId)}: ${formatSigned(f.opening, f.currency, x)} at the start, ${formatSigned(f.closing, f.currency, x)} at the end`)
                .join("; ")}. Restricted money is part of the cash below, not extra cash.`}
        </dd>
        <dt>Unresolved issues</dt>
        <dd>
          {open.length === 0 ? "No disclosed open exception." : `${open.length} open: ${open.map((e) => `${e.description} (${e.exceptionId})`).join(" ")}`}
        </dd>
      </dl>
      <H2>Money movement</H2>
      {b.summary.currencies.map((c) => (
        <div key={c.currency} className="table-scroll" role="region" aria-label={`Money movement in ${c.currency}`} tabIndex={0}>
          <table>
            <DemoCaption>
              Cash movement in {c.currency}, {b.manifest.periodId}, computed from the full register. Loan proceeds are financing, not income.
            </DemoCaption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="num">
                  Amount ({c.currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Cash at the start", formatSigned(c.opening, c.currency, x)],
                ["Received, operating", formatAmount(c.receipts.operating, c.currency, x)],
                ["Received, financing (not income)", formatAmount(c.receipts.financing, c.currency, x)],
                ["Paid out, operating", formatAmount(c.disbursements.operating, c.currency, x)],
                ["Paid out, financing", formatAmount(c.disbursements.financing, c.currency, x)],
                ["Reversals, net", formatMovement(c.reversalsNet, c.currency, x)],
                ["Internal transfers, net (always zero)", formatMovement(c.transfers.internalNet, c.currency, x)],
                ["Transfers across the scope boundary, net", formatMovement(c.transfers.boundaryNet, c.currency, x)],
                ["Cash at the end", formatSigned(c.closing, c.currency, x)],
              ].map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td className="num">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function reviewState(b: LoadedBundle): string {
  const refs = new Set(b.events.flatMap((e) => e.evidence.reportRefs));
  const attestations = b.events.filter((e) => e.type === "attestation").length;
  if (refs.size === 0 && attestations === 0) return "Not examined. This publication includes no independent report.";
  return `Not shown as examined. The register refers to ${refs.size + attestations} report record(s), but no signed outside report is published with it.`;
}

/** Whole calendar days (UTC) from a period's last day to the publication date. */
const daysBetween = (fromDay: string, toIso: string) => Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromDay)) / 86_400_000);

/** Separate evidence states (MR-46) and freshness (MR-47). */
export function StateFields({ bundle: b, headingLevel = 2 }: { bundle: LoadedBundle; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2";
  const rec = b.scope.reconciliation;
  const open = b.exceptions.exceptions.filter((e) => e.status === "open");
  const quarterly = /-Q[1-4]$/.test(b.manifest.periodId);
  return (
    <section aria-labelledby="evidence-states">
      <H id="evidence-states">Evidence, one state at a time</H>
      <p>Each line below is a separate question with its own answer. None of them stands for the others.</p>
      <dl className="facts">
        <dt>Environment</dt>
        <dd>{ENVIRONMENT_LABELS[b.manifest.environment] ?? b.manifest.environment}</dd>
        <dt>Publication</dt>
        <dd>
          Published as a demo on {utcTime(b.manifest.publishedAt)}, as a sealed bundle you can download (commitment sequence {b.manifest.commitmentSequence}).
        </dd>
        <dt>Chain commitment</dt>
        <dd>Not attempted. Nothing about this publication has been recorded on any blockchain.</dd>
        <dt>Reconciliation</dt>
        <dd>
          {RECONCILIATION_LABELS[rec.status]}
          {rec.date ? `, ${day(rec.date)}` : ""}. {rec.coverage}
        </dd>
        <dt>Independent review</dt>
        <dd>{reviewState(b)}</dd>
        <dt>Exceptions</dt>
        <dd>{open.length === 0 ? "No disclosed open exception." : `${open.length} exception${open.length === 1 ? "" : "s"} open.`}</dd>
        <dt>Freshness</dt>
        <dd>
          {quarterly ? "Quarterly reporting. " : ""}Reporting cutoff {utcTime(b.scope.cutoff)}; published {utcTime(b.manifest.publishedAt)}, {daysBetween(b.scope.periodEnd, b.manifest.publishedAt)}{" "}
          days after the period ended. No intended close date is stated for this demo, so no deadline is shown as met or missed. Last chain check: none, because no
          chain check is made.
        </dd>
      </dl>
      <p>
        This site checked the files before showing them: the digests, the inclusion proofs and the totals all match. You do not have to take the site&rsquo;s word
        for it: <Link href="/marrs-rover/verify">check the files yourself</Link>.
      </p>
    </section>
  );
}

export function Hash({ value }: { value: string }) {
  return <code className="hash">{value}</code>;
}

export { readable };
