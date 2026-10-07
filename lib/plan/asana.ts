import { z } from "zod";

/**
 * Read-only Asana client for the OneRhythm plan (PRD A-2, A-3, A-7).
 *
 * It can make exactly one kind of request: GET on one of the two endpoints
 * in ALLOWED_ENDPOINTS, with the opt_fields the projection needs. There is
 * no method parameter and no write method; `assertAllowed` refuses anything
 * else before a request is built. Every page of every list is read; if any
 * page fails, the whole read fails, so a partial plan is never published.
 *
 * Responses are parsed with schemas that keep only the fields below, so
 * notes, assignees, followers, tags, custom fields and anything else the
 * provider returns are dropped at the boundary, before anything is stored.
 */

export const API_BASE = "https://app.asana.com/api/1.0";

/** Fields the projection uses. Nothing else is requested. */
const TASK_FIELDS = "name,completed,due_on,resource_subtype";
const PROJECT_TASK_FIELDS = `${TASK_FIELDS},parent`;

const GID = "\\d{1,32}";
export const ALLOWED_ENDPOINTS = [
  { name: "project-tasks", pattern: new RegExp(`^/projects/${GID}/tasks$`), optFields: PROJECT_TASK_FIELDS },
  { name: "subtasks", pattern: new RegExp(`^/tasks/${GID}/subtasks$`), optFields: TASK_FIELDS },
] as const;

export const PAGE_LIMIT = 100;
/** A plan larger than this many pages per list is refused rather than read in part. */
export const MAX_PAGES = 50;
export const MAX_RESPONSE_BYTES = 2_000_000;
export const REQUEST_TIMEOUT_MS = 10_000;
/** Subtask lists read at once. */
const CONCURRENCY = 4;

export class PlanReadError extends Error {
  /** `status` is the provider's HTTP status, when it answered with one. */
  constructor(
    readonly reason: string,
    readonly status?: number,
  ) {
    super(`plan read failed: ${reason}`);
    this.name = "PlanReadError";
  }
}

/** Throws unless this is a GET on an allowlisted endpoint. */
export function assertAllowed(method: string, path: string): (typeof ALLOWED_ENDPOINTS)[number] {
  if (method !== "GET") throw new PlanReadError(`method ${method} is not allowed`);
  const endpoint = ALLOWED_ENDPOINTS.find((e) => e.pattern.test(path));
  if (!endpoint) throw new PlanReadError("endpoint is not allowlisted");
  return endpoint;
}

const isGid = (s: string) => new RegExp(`^${GID}$`).test(s);

const RawTask = z.object({
  gid: z.string().regex(new RegExp(`^${GID}$`)),
  name: z.string(),
  completed: z.boolean(),
  due_on: z.iso.date().nullable().optional(),
  resource_subtype: z.string().optional(),
  parent: z.object({ gid: z.string() }).nullable().optional(),
});
export type RawTask = z.infer<typeof RawTask>;

const Page = z.object({
  data: z.array(RawTask),
  next_page: z.object({ offset: z.string().min(1).max(512) }).nullable().optional(),
});

export type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;
export type ReaderDeps = {
  token: string;
  fetchImpl?: FetchImpl;
  /** Aborts requests still in flight once the read has failed elsewhere. */
  signal?: AbortSignal;
};

async function getPage(path: string, offset: string | null, deps: ReaderDeps): Promise<z.infer<typeof Page>> {
  const endpoint = assertAllowed("GET", path);
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("opt_fields", endpoint.optFields);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (offset) url.searchParams.set("offset", offset);
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${deps.token}`, Accept: "application/json", "User-Agent": "vt-infinite.com plan reader" },
      redirect: "error",
      signal: deps.signal ? AbortSignal.any([deps.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new PlanReadError(`${endpoint.name}: network`);
  }
  if (!res.ok) throw new PlanReadError(`${endpoint.name}: HTTP ${res.status}`, res.status);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new PlanReadError(`${endpoint.name}: response too large`);
  const body = await res.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new PlanReadError(`${endpoint.name}: response too large`);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new PlanReadError(`${endpoint.name}: not JSON`);
  }
  const parsed = Page.safeParse(json);
  if (!parsed.success) throw new PlanReadError(`${endpoint.name}: unexpected shape`);
  return parsed.data;
}

/** Every page of one list, in the provider's order. */
async function getAll(path: string, deps: ReaderDeps): Promise<RawTask[]> {
  const out: RawTask[] = [];
  const seenOffsets = new Set<string>();
  let offset: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (deps.signal?.aborted) throw new PlanReadError("stopped after another read failed");
    const p = await getPage(path, offset, deps);
    out.push(...p.data);
    const next = p.next_page?.offset ?? null;
    if (!next) return out;
    if (seenOffsets.has(next)) throw new PlanReadError("pagination repeated an offset");
    seenOffsets.add(next);
    offset = next;
  }
  throw new PlanReadError(`more than ${MAX_PAGES} pages`);
}

const isListed = (t: RawTask) => t.resource_subtype !== "section";

function uniqueByGid(tasks: RawTask[]): RawTask[] {
  const seen = new Set<string>();
  return tasks.filter((t) => (seen.has(t.gid) ? false : (seen.add(t.gid), true)));
}

export type PlanSource = Array<{ task: RawTask; subtasks: RawTask[] }>;

/**
 * Read the whole plan: the project's tasks in project order, and each
 * initiative's subtasks in their own order. A task with a parent is a
 * subtask that is also listed on the project; it appears only under its
 * parent, never as a second initiative. Once one subtask read fails, no
 * further subtask request starts and those in flight are aborted: the read
 * has already failed, so they could only add load.
 */
export async function readPlanSource(projectId: string, deps: ReaderDeps): Promise<PlanSource> {
  if (!isGid(projectId)) throw new PlanReadError("project ID is not a valid identifier");
  const tasks = await getAll(`/projects/${projectId}/tasks`, deps);
  const initiatives = uniqueByGid(tasks.filter((t) => !t.parent && isListed(t)));
  const out: PlanSource = new Array(initiatives.length);
  const stop = new AbortController();
  const signal = deps.signal ? AbortSignal.any([deps.signal, stop.signal]) : stop.signal;
  let next = 0;
  const worker = async () => {
    while (next < initiatives.length && !signal.aborted) {
      const i = next++;
      const task = initiatives[i] as RawTask;
      try {
        const subtasks = await getAll(`/tasks/${task.gid}/subtasks`, { ...deps, signal });
        out[i] = { task, subtasks: uniqueByGid(subtasks.filter(isListed)) };
      } catch (err) {
        stop.abort();
        throw err;
      }
    }
  };
  // The first failure is the one reported; siblings stopped by it are not.
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, initiatives.length) }, worker));
  // An outside abort can end the workers early without an error; never return a partial plan.
  if (Array.from(out).some((x) => x === undefined)) throw new PlanReadError("subtasks: incomplete");
  return out;
}
