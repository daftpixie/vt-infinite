export type JobStatus = { status: "ok" | "error"; detail?: Record<string, unknown> };

/**
 * Run one refresh job in isolation. A throw is logged with the job name and
 * the error class only (never the message, which could carry a value) and
 * reported as that job's status, so the other jobs still report theirs.
 */
export async function runJob(
  name: string,
  job: () => Promise<{ ok: boolean; detail?: Record<string, unknown> }>,
  log: (m: string) => void = (m) => console.error(m),
): Promise<JobStatus> {
  try {
    const r = await job();
    return { status: r.ok ? "ok" : "error", ...(r.detail ? { detail: r.detail } : {}) };
  } catch (err) {
    const e = err as { name?: string; code?: string };
    log(`cron: job ${name} failed error=${[e?.name ?? "Error", e?.code].filter(Boolean).join(":")}`);
    return { status: "error" };
  }
}
