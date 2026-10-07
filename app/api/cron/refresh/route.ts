import { refreshRepos } from "@/lib/code/repos";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { refreshAll } from "@/lib/streams/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The only place upstream providers are contacted (PRD SS-2). Invoked by
 * Vercel Cron every fifteen minutes (vercel.json). Publications keep their
 * own fifteen-minute floor and backoff; repositories refresh at most hourly.
 * Anything without the cron authorization gets a plain 404.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 404 });
  }
  if (process.env.UPSTREAM_REFRESH === "off") {
    return Response.json({ ok: true, refresh: "off" });
  }
  const [streams, repos] = await Promise.all([refreshAll(), refreshRepos()]);
  return Response.json({
    ok: true,
    streams,
    repos: { skipped: repos.skipped, moved: repos.moved.length, notPublic: repos.notPublic.length, unavailable: repos.unavailable.length },
  });
}

function notFound() {
  return new Response(null, { status: 404 });
}
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
