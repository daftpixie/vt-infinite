import { isEnabled } from "@/lib/flags";
import { isShown, readPlan } from "@/lib/plan/service";
import { landingNotFound } from "@/lib/mode-gate";

export const dynamic = "force-dynamic";

/**
 * The plan page's poller reads this: the stored projection, never Asana.
 * Off or withdrawn, it answers 404 like the page. Never cached, so a
 * withdrawal reaches every reader on the next poll.
 */
export async function GET() {
  const landing = landingNotFound();
  if (landing) return landing;
  if (!isEnabled("plan")) return notFound();
  const state = await readPlan();
  if (!isShown(state)) return notFound();
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}

/** Every 404 is uncached too, so turning the plan on or restoring it is never hidden by a cached 404. */
function notFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
