/**
 * Polls the site's own plan projection while the page is visible (PRD A-4).
 * Never contacts Asana. Stops while the document is hidden and catches up
 * when it is shown again. Browser-safe: no Node imports.
 */
export const PLAN_POLL_MS = 60_000;

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
