import { refreshRepos } from "@/lib/code/repos";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runJob } from "@/lib/cron/jobs";
import { refreshAll } from "@/lib/streams/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The only place upstream providers are contacted (PRD SS-2). Invoked by
 * Vercel Cron every fifteen minutes (vercel.json). Publications keep their
 * own fifteen-minute floor and backoff; repositories refresh at most hourly.
 * Anything without the cron authorization gets a plain 404. Otherwise the
 * answer is 200 with each job's own status: one job failing (a store write,
 * say) never hides the others' results or turns the run into a 500.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 404 });
  }
  if (process.env.UPSTREAM_REFRESH === "off") {
    return Response.json({ ok: true, refresh: "off" });
  }
  const [streams, repos] = await Promise.all([
    runJob("streams", async () => {
      const results = await refreshAll();
      // A publication whose refresh threw (not an upstream failure) fails the job.
      return { ok: !Object.values(results).includes("error"), detail: { publications: results } };
    }),
    runJob("repos", async () => {
      const r = await refreshRepos();
      return { ok: true, detail: { skipped: r.skipped, moved: r.moved.length, notPublic: r.notPublic.length, unavailable: r.unavailable.length } };
    }),
  ]);
  const jobs = { streams, repos };
  return Response.json({ ok: Object.values(jobs).every((j) => j.status === "ok"), jobs });
}

function notFound() {
  return new Response(null, { status: 404 });
}
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
