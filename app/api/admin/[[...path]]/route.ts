/** Admin API: every method returns 404 until stage 6 (PRD §22). */
function deny(): Response {
  return new Response(null, { status: 404 });
}

export const dynamic = "force-dynamic";
export const GET = deny;
export const HEAD = deny;
export const POST = deny;
export const PUT = deny;
export const PATCH = deny;
export const DELETE = deny;
export const OPTIONS = deny;
