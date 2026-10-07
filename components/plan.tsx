import Link from "next/link";
import { formatDateTime, formatDay } from "@/lib/content/dates";
import type { PlanInitiative, PlanStep } from "@/lib/plan/projection";
import type { PublicPlanState } from "@/lib/plan/service";
import { CrisisSupport } from "./CrisisSupport";

/**
 * The OneRhythm plan, rendered from the stored projection only (PRD A-5).
 * Every state is written in words; milestones differ by text and weight,
 * never by colour alone. Used on the server and by the page's poller.
 */

function counts(i: PlanInitiative) {
  const done = i.steps.filter((s) => s.completed).length;
  return { done, open: i.steps.length - done };
}

function Due({ day }: { day: string | null }) {
  return day ? (
    <>
      {" · Due "}
      <time dateTime={day}>{formatDay(day)}</time>
    </>
  ) : null;
}

function Title({ item }: { item: PlanStep }) {
  return item.milestone ? (
    <strong className="plan-milestone">
      <span className="plan-milestone-label">Milestone:</span> {item.title}
    </strong>
  ) : (
    <>{item.title}</>
  );
}

/** Last read, stale and unavailable states, server-rendered (A-4, A-8). */
export function PlanStatus({ state }: { state: PublicPlanState }) {
  if (state.status === "unavailable") {
    return (
      <p className="notice-inline" data-plan-status="unavailable">
        ▪ OneRhythm plan unavailable.
      </p>
    );
  }
  if (state.status === "held") {
    return (
      <p className="notice-inline" data-plan-status="held">
        ▪ The latest read of the plan had nothing to show. It is held for review and not shown.
      </p>
    );
  }
  const read = <time dateTime={state.readAt}>{formatDateTime(state.readAt)}</time>;
  return state.status === "stale" ? (
    <p className="notice-inline" data-plan-status="stale">
      ▪ Last read {read}. This read is more than 30 minutes old; newer changes may be missing.
    </p>
  ) : (
    <p className="notice-inline" data-plan-status="fresh">
      Last read {read}.
    </p>
  );
}

function Withheld({ state }: { state: PublicPlanState }) {
  if (state.status !== "fresh" && state.status !== "stale") return null;
  const n = state.withheld.initiatives + state.withheld.steps;
  if (n === 0) return null;
  return (
    <p className="notice-inline" data-plan-withheld={n}>
      ▪ {n === 1 ? "1 item is" : `${n} items are`} held for review and not shown. Counts leave {n === 1 ? "it" : "them"} out.
    </p>
  );
}

const anyMention = (initiatives: PlanInitiative[]) => initiatives.some((i) => i.mentionsSuicide || i.steps.some((s) => s.mentionsSuicide));

export function PlanBody({ state }: { state: PublicPlanState }) {
  const initiatives = state.status === "fresh" || state.status === "stale" ? state.initiatives : [];
  return (
    <>
      <PlanStatus state={state} />
      <Withheld state={state} />
      {(state.status === "fresh" || state.status === "stale") && initiatives.length === 0 ? <p>No steps are listed.</p> : null}
      {initiatives.length > 0 ? (
        <ol className="plan-list">
          {initiatives.map((i) => {
            const c = counts(i);
            return (
              <li key={i.key} className="plan-initiative">
                <h2 className="plan-initiative-title">
                  <Title item={i} />
                </h2>
                <p className="label">
                  {c.done} done · {c.open} open
                  {i.completed ? " · Initiative done" : ""}
                  <Due day={i.dueOn} />
                </p>
                {i.steps.length > 0 ? (
                  <ol className="plan-steps">
                    {i.steps.map((s) => (
                      <li key={s.key} className={s.milestone ? "plan-step plan-step-milestone" : "plan-step"}>
                        <span className="plan-state">{s.completed ? "Done" : "Open"}</span> <Title item={s} />
                        <Due day={s.dueOn} />
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {anyMention(initiatives) ? <CrisisSupport /> : null}
    </>
  );
}

/** Home's summary: initiatives, done and open counts, milestones and the last read, from the same snapshot (PRD §05). */
export function PlanSummary({ state }: { state: PublicPlanState }) {
  const initiatives = state.status === "fresh" || state.status === "stale" ? state.initiatives : [];
  return (
    <section aria-labelledby="plan-summary" className="plan-summary">
      <h3 id="plan-summary">OneRhythm plan</h3>
      <PlanStatus state={state} />
      {initiatives.length > 0 ? (
        <ul className="plan-summary-list">
          {initiatives.map((i) => {
            const c = counts(i);
            return (
              <li key={i.key}>
                <Title item={i} />
                <span className="label">
                  {" "}
                  · {c.done} done · {c.open} open
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {initiatives.some((i) => i.mentionsSuicide) ? <CrisisSupport /> : null}
      <p>
        <Link href="/plan/onerhythm">Read the OneRhythm plan</Link>
      </p>
    </section>
  );
}
