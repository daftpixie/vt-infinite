import { formatDate } from "@/lib/content/dates";
import { ExternalLink } from "./ExternalLink";

type Correction = { date: string; kind: "substantive" | "style"; explanation: string; editor: string; earlierVersionUrl?: string };

/** Dated corrections, shown before everything else on the page (PRD W-7; brand rule 9). */
export function Corrections({ corrections }: { corrections?: Correction[] }) {
  if (!corrections?.length) return null;
  const sorted = [...corrections].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="corrections" aria-labelledby="corrections-heading">
      <h2 id="corrections-heading" className="label">
        Corrections
      </h2>
      <ul>
        {sorted.map((c) => (
          <li key={`${c.date}-${c.explanation.slice(0, 20)}`}>
            <p>
              <time dateTime={c.date}>{formatDate(c.date)}</time> · {c.kind === "substantive" ? "Correction" : "Style change"}: {c.explanation}
            </p>
            <p className="label">
              Editor: {c.editor}
              {c.earlierVersionUrl ? (
                <>
                  {" · "}
                  <ExternalLink href={c.earlierVersionUrl}>earlier version</ExternalLink>
                </>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
