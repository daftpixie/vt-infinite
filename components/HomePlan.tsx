import { isShown, type PlanState } from "@/lib/plan/service";
import { Placeholder } from "./Placeholder";
import { PlanSummary } from "./plan";

/**
 * Home's plan block (server only). Off or withdrawn, only the placeholder
 * for the summary shows. Shown, it carries the plan's description and the
 * summary from the shared snapshot (PRD §05). Before the plan is turned on,
 * the description placeholder is replaced with the approved text (P11); a
 * release check fails the build if any placeholder renders here, or on
 * /plan/onerhythm, with the plan on (docs/ops/plan.md).
 */
export function HomePlan({ state }: { state: PlanState }) {
  if (!isShown(state)) return <Placeholder id="oneRhythmSummary" />;
  return (
    <>
      <Placeholder id="oneRhythmPlanIntro" />
      <PlanSummary state={state} />
    </>
  );
}
