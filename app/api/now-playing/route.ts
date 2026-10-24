import { connection } from "next/server";
import { nowPlayingEnabled } from "@/lib/now-playing/config";
import { readNowPlaying } from "@/lib/now-playing/service";

/**
 * "Now playing" for the poller on `/` and /vibes (ADR 0009). It serves the
 * shared projection; at most one Spotify read per 30 s happens behind it,
 * whoever asks. It belongs to both releases: in landing mode it is one of
 * LANDING_PATHS, and in either mode it answers 404 unless
 * NOW_PLAYING_ENABLED is "true". Never cached, so switching the feature off
 * or pausing sharing reaches every reader on the next poll.
 */
export async function GET() {
  await connection();
  if (!nowPlayingEnabled()) return notFound();
  return Response.json(await readNowPlaying(), { headers: { "Cache-Control": "no-store" } });
}

function notFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
