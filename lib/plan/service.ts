import { isEnabled } from "@/lib/flags";
import { getSnapshotStore, type SnapshotStore } from "@/lib/storage";
import { PlanReadError, readPlanSource, type FetchImpl } from "./asana";
import { keyAllocator, type KeyIndex } from "./keys";
import { DEFAULT_REDIRECT_URI, getAccessToken } from "./oauth";
import { projectPlan, type PlanInitiative, type PlanProjection } from "./projection";

/**
 * The OneRhythm plan snapshot (PRD A-4, A-8). Only the scheduled job reads
 * Asana; pages and the plan API read the stored projection. Withdrawal and
 * the hold on an empty read are applied when the snapshot is read, so they
 * take effect at once, without a refresh and without the provider.
 */
export const PLAN_KEYS = {
  data: "plan:onerhythm",
  meta: "plan-meta:onerhythm",
  control: "plan-control:onerhythm",
  index: "plan-keys:onerhythm",
} as const;

/** At most one read per minute while the plan is enabled (A-4). */
export const PLAN_REFRESH_FLOOR_MS = 60 * 1000;
export const PLAN_MAX_BACKOFF_MS = 15 * 60 * 1000;
/** A read older than this is labeled stale (A-8). */
export const PLAN_STALE_AFTER_MS = 30 * 60 * 1000;
export const PLAN_SCHEMA_VERSION = 1;

/** Environment variable names. Values live only in the host's environment. */
export const PLAN_ENV = {
  projectId: "ASANA_PLAN_PROJECT_ID",
  clientId: "ASANA_PLAN_CLIENT_ID",
  clientSecret: "ASANA_PLAN_CLIENT_SECRET",
  refreshToken: "ASANA_PLAN_REFRESH_TOKEN",
  redirectUri: "ASANA_PLAN_REDIRECT_URI",
  keySecret: "PLAN_KEY_SECRET",
} as const;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Operator decisions, written by hand (docs/ops/plan.md):
 * - `withdrawn`: removes the plan from every surface at once.
 * - `publishEmpty`: an empty successful read is published instead of held.
 */
export type PlanControl = { withdrawn?: boolean; publishEmpty?: boolean };
type PlanMeta = {
  lastAttemptAt: string;
  consecutiveFailures: number;
  nextAttemptAt: string;
  /** Set when the last successful read had nothing to show; cleared by a non-empty read. */
  heldEmptyAt: string | null;
};

export type PlanRefreshResult = "off" | "withdrawn" | "skipped" | "unconfigured" | "failed" | "held-empty" | "updated";

type Deps = {
  store?: SnapshotStore;
  env?: Env;
  now?: () => Date;
  fetchImpl?: FetchImpl;
  log?: (m: string) => void;
};

export function missingPlanConfig(env: Env): string[] {
  const missing: string[] = [PLAN_ENV.projectId, PLAN_ENV.clientId, PLAN_ENV.clientSecret, PLAN_ENV.refreshToken, PLAN_ENV.keySecret].filter((n) => !env[n]);
  if (env[PLAN_ENV.projectId] && !/^\d{1,32}$/.test(env[PLAN_ENV.projectId] as string)) missing.push(`${PLAN_ENV.projectId} (digits only)`);
  if (env[PLAN_ENV.keySecret] && (env[PLAN_ENV.keySecret] as string).length < 32) missing.push(`${PLAN_ENV.keySecret} (at least 32 characters)`);
  return missing;
}

const errorClass = (err: unknown) => {
  const e = err as { name?: string; code?: string };
  return [e?.name ?? "Error", e?.code].filter(Boolean).join(":");
};

/**
 * Refresh the plan snapshot. Called only by the scheduled job. A failed
 * read keeps the last good projection and its read time (A-8); an empty
 * read is held for review unless the operator has chosen to publish it.
 */
export async function refreshPlan(deps: Deps = {}): Promise<PlanRefreshResult> {
  const env = deps.env ?? process.env;
  if (!isEnabled("plan", env)) return "off";
  const store = deps.store ?? getSnapshotStore("refresh");
  const log = deps.log ?? ((m: string) => console.warn(m));
  const now = (deps.now ?? (() => new Date()))();

  const control = (await store.get<PlanControl>(PLAN_KEYS.control))?.data ?? {};
  if (control.withdrawn === true) return "withdrawn";
  const meta = (await store.get<PlanMeta>(PLAN_KEYS.meta))?.data ?? null;
  if (meta && now.getTime() < Date.parse(meta.nextAttemptAt)) return "skipped";

  const missing = missingPlanConfig(env);
  if (missing.length) {
    log(`plan: not configured; missing ${missing.join(", ")}`);
    return "unconfigured";
  }

  const putMeta = (m: Omit<PlanMeta, "lastAttemptAt">) =>
    store.put<PlanMeta>(PLAN_KEYS.meta, { schemaVersion: PLAN_SCHEMA_VERSION, fetchedAt: now.toISOString(), data: { lastAttemptAt: now.toISOString(), ...m } });

  let source;
  try {
    const token = await getAccessToken(
      {
        clientId: env[PLAN_ENV.clientId] as string,
        clientSecret: env[PLAN_ENV.clientSecret] as string,
        refreshToken: env[PLAN_ENV.refreshToken] as string,
        redirectUri: env[PLAN_ENV.redirectUri] || DEFAULT_REDIRECT_URI,
      },
      { fetchImpl: deps.fetchImpl, now: () => now, log },
    );
    source = await readPlanSource(env[PLAN_ENV.projectId] as string, { token, fetchImpl: deps.fetchImpl });
  } catch (err) {
    const failures = (meta?.consecutiveFailures ?? 0) + 1;
    const wait = Math.min(PLAN_REFRESH_FLOOR_MS * 2 ** (failures - 1), PLAN_MAX_BACKOFF_MS);
    await putMeta({ consecutiveFailures: failures, nextAttemptAt: new Date(now.getTime() + wait).toISOString(), heldEmptyAt: meta?.heldEmptyAt ?? null });
    log(`plan: read failed (${err instanceof PlanReadError ? err.reason : errorClass(err)}); attempt ${failures}; last good projection kept`);
    return "failed";
  }

  const prior = (await store.get<KeyIndex>(PLAN_KEYS.index))?.data ?? {};
  const keys = keyAllocator(prior, env[PLAN_ENV.keySecret] as string);
  const projection = projectPlan(source, { keyFor: keys.keyFor, env, log });
  const next = new Date(now.getTime() + PLAN_REFRESH_FLOOR_MS).toISOString();

  if (projection.initiatives.length === 0 && control.publishEmpty !== true) {
    // Neither erase nor keep showing the previous plan without a decision (A-8).
    await putMeta({ consecutiveFailures: 0, nextAttemptAt: next, heldEmptyAt: now.toISOString() });
    log("plan: the read had nothing to show; held for review (docs/ops/plan.md)");
    return "held-empty";
  }
  await store.put<KeyIndex>(PLAN_KEYS.index, { schemaVersion: PLAN_SCHEMA_VERSION, fetchedAt: now.toISOString(), data: keys.index() });
  await store.put<PlanProjection>(PLAN_KEYS.data, { schemaVersion: PLAN_SCHEMA_VERSION, fetchedAt: now.toISOString(), data: projection });
  await putMeta({ consecutiveFailures: 0, nextAttemptAt: next, heldEmptyAt: null });
  return "updated";
}

/** What a reader may see. `off` and `withdrawn` mean the plan does not exist on any surface. */
export type PlanState =
  | { status: "off" }
  | { status: "withdrawn" }
  | { status: "held" }
  | { status: "unavailable" }
  | { status: "fresh" | "stale"; readAt: string; initiatives: PlanInitiative[]; withheld: PlanProjection["withheld"] };

/** The public form, served to the page's poller. */
export type PublicPlanState = Exclude<PlanState, { status: "off" } | { status: "withdrawn" }>;

export function isShown(s: PlanState): s is PublicPlanState {
  return s.status !== "off" && s.status !== "withdrawn";
}

/** Read the plan for a page or the plan API. Never contacts Asana. */
export async function readPlan(deps: Pick<Deps, "store" | "env" | "now"> = {}): Promise<PlanState> {
  const env = deps.env ?? process.env;
  if (!isEnabled("plan", env)) return { status: "off" };
  const store = deps.store ?? getSnapshotStore("read");
  const now = (deps.now ?? (() => new Date()))();
  let control: PlanControl, meta: PlanMeta | null, snap;
  try {
    control = (await store.get<PlanControl>(PLAN_KEYS.control))?.data ?? {};
    meta = (await store.get<PlanMeta>(PLAN_KEYS.meta))?.data ?? null;
    snap = await store.get<PlanProjection>(PLAN_KEYS.data);
  } catch (err) {
    // Without the control record a withdrawal cannot be ruled out: show nothing.
    console.error(`snapshots: read failed key=plan error=${errorClass(err)}`);
    return { status: "unavailable" };
  }
  if (control.withdrawn === true) return { status: "withdrawn" };
  const staleness = (readAt: string) => (now.getTime() - Date.parse(readAt) > PLAN_STALE_AFTER_MS ? "stale" : "fresh");
  if (meta?.heldEmptyAt) {
    // The operator chose to publish an empty read: show it, not the older plan.
    if (control.publishEmpty === true) return { status: staleness(meta.heldEmptyAt), readAt: meta.heldEmptyAt, initiatives: [], withheld: { initiatives: 0, steps: 0 } };
    return { status: "held" };
  }
  if (!snap) return { status: "unavailable" };
  return { status: staleness(snap.fetchedAt), readAt: snap.fetchedAt, initiatives: snap.data.initiatives, withheld: snap.data.withheld };
}
