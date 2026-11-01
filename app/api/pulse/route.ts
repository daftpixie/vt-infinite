import { connection } from "next/server";
import { publicPulseEnabled } from "@/lib/pulse/config";
import { readPulse } from "@/lib/pulse/service";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function closed() { return new Response(null, { status: 404, headers }); }

/** No caller-supplied site, URL, filter or query. Only the approved aggregate projection. */
export async function GET(request: Request) {
  await connection();
  if (!publicPulseEnabled()) return closed();
  if (new URL(request.url).search) return new Response(null, { status: 400, headers });
  return Response.json(await readPulse(), { headers });
}
export const POST = closed;
export const PUT = closed;
export const PATCH = closed;
export const DELETE = closed;
