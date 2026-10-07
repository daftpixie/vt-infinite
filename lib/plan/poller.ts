/**
 * Polls the site's own plan projection while the page is visible (PRD A-4).
 * Never contacts Asana. Stops while the document is hidden and catches up
 * when it is shown again. Browser-safe: no Node imports.
 */
import type { PublicPlanState } from "./service";

export const PLAN_POLL_MS = 60_000;
/** A read older than this is labeled stale (A-8). */
export const PLAN_STALE_AFTER_MS = 30 * 60 * 1000;

/** Fresh or stale, from the read time alone. Used by the server and, every poll tick, by the page. */
export function staleness(readAt: string, nowMs: number): "fresh" | "stale" {
  return nowMs - Date.parse(readAt) > PLAN_STALE_AFTER_MS ? "stale" : "fresh";
}

/**
 * Recompute the stale label from the last read time. The server labels a
 * read when it renders or answers a poll; a tab whose polls keep failing
 * would otherwise keep showing "fresh" for as long as it stays open. It
 * only ever turns fresh into stale: a browser clock that runs behind never
 * relabels a read the server called stale.
 */
export function restale(state: PublicPlanState, nowMs: number): PublicPlanState {
  if (state.status !== "fresh") return state;
  return staleness(state.readAt, nowMs) === "stale" ? { ...state, status: "stale" } : state;
}

export type PollOnceDeps = {
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  /** Called on a 404: the plan was disabled or withdrawn. */
  gone: () => void;
};

/**
 * One poll of the site's projection. Resolves to an update for the shown
 * state: the new projection when the poll worked, otherwise the shown one
 * with its stale label recomputed, so a failing poll still ages it.
 */
export async function pollPlanOnce(url: string, deps: PollOnceDeps): Promise<(shown: PublicPlanState) => PublicPlanState> {
  const age = (s: PublicPlanState) => restale(s, deps.now());
  let res: Response;
  try {
    res = await deps.fetchImpl(url, { cache: "no-store", headers: { Accept: "application/json" } });
  } catch {
    return age; // Keep what is shown; its read time stays visible.
  }
  if (res.status === 404) {
    deps.gone();
    return (s) => s;
  }
  if (!res.ok) return age;
  let next: PublicPlanState;
  try {
    next = (await res.json()) as PublicPlanState;
  } catch {
    return age;
  }
  return () => age(next);
}

export type PollDeps = {
  fetchOnce: () => Promise<void>;
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

export function startPlanPolling(deps: PollDeps): () => void {
  const interval = deps.intervalMs ?? PLAN_POLL_MS;
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let last = now();
  let stopped = false;

  const schedule = (ms: number) => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(tick, Math.max(0, ms));
  };
  async function tick() {
    timer = null;
    if (stopped || deps.doc.visibilityState !== "visible") return;
    last = now();
    try {
      await deps.fetchOnce();
    } catch {
      // A failed poll keeps what is shown; the next one tries again.
    }
    if (!stopped && deps.doc.visibilityState === "visible") schedule(interval);
  }
  const onVisibility = () => {
    if (stopped) return;
    if (deps.doc.visibilityState !== "visible") {
      if (timer !== null) clearTimer(timer);
      timer = null;
      return;
    }
    schedule(interval - (now() - last));
  };

  deps.doc.addEventListener("visibilitychange", onVisibility);
  if (deps.doc.visibilityState === "visible") schedule(interval);
  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    deps.doc.removeEventListener("visibilitychange", onVisibility);
  };
}
