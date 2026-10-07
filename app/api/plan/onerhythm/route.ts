import { isEnabled } from "@/lib/flags";
import { isShown, readPlan } from "@/lib/plan/service";

export const dynamic = "force-dynamic";

/**
 * The plan page's poller reads this: the stored projection, never Asana.
 * Off or withdrawn, it answers 404 like the page. Never cached, so a
 * withdrawal reaches every reader on the next poll.
 */
export async function GET() {
  if (!isEnabled("plan")) return new Response(null, { status: 404 });
  const state = await readPlan();
  if (!isShown(state)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}

function notFound() {
  return new Response(null, { status: 404 });
}
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
