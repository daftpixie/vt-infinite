"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicPlanState } from "@/lib/plan/service";
import { startPlanPolling } from "@/lib/plan/poller";
import { PlanBody } from "./plan";

export const PLAN_API = "/api/plan/onerhythm";

/**
 * The plan page's body. The server renders it in full, so it works without
 * JavaScript; with JavaScript it polls the site's projection every 60 s
 * while visible (PRD A-4). A 404 means the plan was disabled or withdrawn:
 * the page reloads, so the plan leaves the screen at once.
 */
export function PlanLive({ initial }: { initial: PublicPlanState }) {
  const [state, setState] = useState(initial);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stop = startPlanPolling({
      doc: document,
      fetchOnce: async () => {
        let res: Response;
        try {
          res = await fetch(PLAN_API, { cache: "no-store", headers: { Accept: "application/json" } });
        } catch {
          return; // Keep what is shown; its read time stays visible.
        }
        if (res.status === 404) {
          window.location.reload();
          return;
        }
        if (res.ok) setState((await res.json()) as PublicPlanState);
      },
    });
    // Marks that polling has started (after hydration); without JavaScript it stays "off".
    if (root.current) root.current.dataset.planLive = "on";
    return stop;
  }, []);
  return (
    <div ref={root} data-plan-live="off">
      <PlanBody state={state} />
    </div>
  );
}
