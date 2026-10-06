import { z } from "zod";
import raw from "@/content/code/repos.json" with { type: "json" };
import { getSnapshotStore, type SnapshotStore } from "@/lib/storage";
import { isStatusLabel, STATUS_REVIEW_AFTER_DAYS } from "@/lib/status";

/**
 * Approved public repositories, in Matthew's order (PRD G-1 to G-4). Only
 * the approved fields are listed here; provider metadata is read with
 * unauthenticated, read-only GitHub requests and kept in a dated snapshot.
 */
const name = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/);

export const RepoEntrySchema = z
  .strictObject({
    owner: name,
    repo: name,
    description: z.string().min(1).max(300),
    initiative: z.string().min(1).max(80),
    status: z.string().refine(isStatusLabel, "not in the approved status vocabulary (G-3)"),
    statusNote: z.string().min(1).max(300).optional(),
    statusDate: z.iso.date(),
    evidenceUrl: z.url({ protocol: /^https$/ }),
    listingApproved: z.literal(true),
  })
  .superRefine((r, ctx) => {
    if (r.status === "Paused" && !r.statusNote) ctx.addIssue({ code: "custom", message: "Paused needs its reason in statusNote" });
  });

export const ReposConfigSchema = z
  .strictObject({ schemaVersion: z.literal(1), repos: z.array(RepoEntrySchema) })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const r of cfg.repos) {
      const k = `${r.owner}/${r.repo}`.toLowerCase();
      if (seen.has(k)) ctx.addIssue({ code: "custom", message: `duplicate ${k}` });
      seen.add(k);
    }
  });

export type RepoEntry = z.infer<typeof RepoEntrySchema>;
export type ReposConfig = z.infer<typeof ReposConfigSchema>;

export const REPOS: ReposConfig = ReposConfigSchema.parse(raw);

/** Statuses due for review (PRD Q-5). Reported by tooling, not shown to readers. */
export function statusesDueForReview(now: Date = new Date(), cfg: ReposConfig = REPOS): RepoEntry[] {
  const limit = STATUS_REVIEW_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return cfg.repos.filter((r) => now.getTime() - Date.parse(`${r.statusDate}T00:00:00Z`) > limit);
}

/** Validated provider metadata. Stars, forks and followers are never read (G-1). */
export type RepoMetadata = {
  owner: string;
  repo: string;
  confirmedPublicAt: string;
  license: string | null;
  language: string | null;
  pushedAt: string | null;
};

type SnapshotData = { repos: RepoMetadata[]; etags?: Record<string, string> };
const KEY = "code-repos";
export const CODE_REFRESH_FLOOR_MS = 60 * 60 * 1000;
export const CODE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type VisibilityResult =
  | { kind: "public"; meta: Omit<RepoMetadata, "confirmedPublicAt">; etag: string | null }
  | { kind: "not-modified" }
  | { kind: "moved" }
  | { kind: "not-public" }
  | { kind: "unavailable" };

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

const API = "https://api.github.com/repos/";

/**
 * G-2 and G-4: one read-only, unauthenticated request. A conditional request
 * (ETag) lets an unchanged repository answer 304, which GitHub does not
 * count against the unauthenticated rate limit. Redirects are not followed:
 * a 301 means the repository was renamed or transferred, so the approved
 * entry no longer names it. Anything but a confirmed public repository is
 * not public.
 */
export async function checkVisibility(
  entry: Pick<RepoEntry, "owner" | "repo">,
  fetchImpl: FetchImpl = fetch,
  etag: string | null = null,
): Promise<VisibilityResult> {
  let res: Response;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "vt-infinite.com repository check",
  };
  if (etag) headers["If-None-Match"] = etag;
  try {
    res = await fetchImpl(`${API}${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status === 304) return { kind: "not-modified" };
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) return { kind: "moved" };
  if (res.status === 404) return { kind: "not-public" };
  if (!res.ok) return { kind: "unavailable" };
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { kind: "unavailable" };
  }
  const fullName = `${entry.owner}/${entry.repo}`.toLowerCase();
  if (String(body.full_name).toLowerCase() !== fullName) return { kind: "moved" };
  if (body.private !== false || body.visibility !== "public") return { kind: "not-public" };
  const license = (body.license as { spdx_id?: unknown } | null)?.spdx_id;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
  const pushed = str(body.pushed_at, 40);
  return {
    kind: "public",
    etag: str(res.headers.get("etag"), 200),
    meta: {
      owner: entry.owner,
      repo: entry.repo,
      license: str(license, 64) === "NOASSERTION" ? null : str(license, 64),
      language: str(body.language, 64),
      pushedAt: pushed && !Number.isNaN(Date.parse(pushed)) ? new Date(pushed).toISOString() : null,
    },
  };
}

export type RepoRefreshReport = { skipped: boolean; moved: string[]; notPublic: string[]; unavailable: string[] };

/**
 * Refresh the snapshot, at most hourly, from the scheduled job only.
 * - Confirmed public (200, or 304 against a stored ETag): listed, dated now.
 * - Confirmed private or missing (404): removed at once.
 * - Moved (301 or a different name): removed and reported for review.
 * - Provider failure: an earlier confirmation is kept with its own date
 *   (Matthew's call, 6 Oct 2026); an entry never confirmed stays hidden.
 */
export async function refreshRepos(
  deps: { store?: SnapshotStore; fetchImpl?: FetchImpl; now?: () => Date; cfg?: ReposConfig; env?: Readonly<Record<string, string | undefined>>; log?: (m: string) => void } = {},
): Promise<RepoRefreshReport> {
  const report: RepoRefreshReport = { skipped: true, moved: [], notPublic: [], unavailable: [] };
  if ((deps.env ?? process.env).UPSTREAM_REFRESH === "off") return report;
  const store = deps.store ?? getSnapshotStore("refresh");
  const log = deps.log ?? ((m: string) => console.warn(m));
  const now = (deps.now ?? (() => new Date()))();
  const cfg = deps.cfg ?? REPOS;
  const prior = await store.get<SnapshotData>(KEY);
  if (prior && now.getTime() - Date.parse(prior.fetchedAt) < CODE_REFRESH_FLOOR_MS) return report;
  report.skipped = false;
  const before = new Map((prior?.data.repos ?? []).map((m) => [`${m.owner}/${m.repo}`.toLowerCase(), m]));
  const etags = prior?.data.etags ?? {};
  const next: RepoMetadata[] = [];
  const nextEtags: Record<string, string> = {};
  for (const entry of cfg.repos) {
    const k = `${entry.owner}/${entry.repo}`.toLowerCase();
    const known = before.get(k);
    const result = await checkVisibility(entry, deps.fetchImpl, known ? (etags[k] ?? null) : null);
    if (result.kind === "public") {
      next.push({ ...result.meta, confirmedPublicAt: now.toISOString() });
      if (result.etag) nextEtags[k] = result.etag;
    } else if (result.kind === "not-modified" && known) {
      next.push({ ...known, confirmedPublicAt: now.toISOString() });
      if (etags[k]) nextEtags[k] = etags[k] as string;
    } else if (result.kind === "moved") {
      report.moved.push(k);
      log(`code: ${k} moved or renamed on GitHub; hidden until its allowlist entry is reviewed`);
    } else if (result.kind === "not-public") {
      report.notPublic.push(k);
    } else {
      report.unavailable.push(k);
      if (known) next.push(known);
    }
  }
  await store.put<SnapshotData>(KEY, { schemaVersion: 1, fetchedAt: now.toISOString(), data: { repos: next, etags: nextEtags } });
  return report;
}

export type RepoView = RepoEntry & { meta: RepoMetadata; stale: boolean };

/** Approved entries that have been confirmed public, in Matthew's order. */
export async function readRepos(deps: { store?: SnapshotStore; now?: () => Date; cfg?: ReposConfig } = {}): Promise<RepoView[]> {
  const store = deps.store ?? getSnapshotStore("read");
  const now = (deps.now ?? (() => new Date()))();
  const cfg = deps.cfg ?? REPOS;
  let snap;
  try {
    snap = await store.get<SnapshotData>(KEY);
  } catch (err) {
    const e = err as { name?: string; code?: string };
    console.error(`snapshots: read failed key=${KEY} error=${[e?.name ?? "Error", e?.code].filter(Boolean).join(":")}`);
    snap = null;
  }
  const byKey = new Map((snap?.data.repos ?? []).map((m) => [`${m.owner}/${m.repo}`.toLowerCase(), m]));
  const out: RepoView[] = [];
  for (const entry of cfg.repos) {
    const meta = byKey.get(`${entry.owner}/${entry.repo}`.toLowerCase());
    if (meta) out.push({ ...entry, meta, stale: now.getTime() - Date.parse(meta.confirmedPublicAt) > CODE_STALE_AFTER_MS });
  }
  return out;
}
