import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "@/lib/flags";
import { assertAllowed, TOKEN_URL, type FetchImpl } from "./client";

/**
 * Test-only: a synthetic Spotify for the end-to-end suite. With
 * NOW_PLAYING_FIXTURE=<name>, ALLOW_CONTENT_FIXTURES=true and not on Vercel,
 * the two allowlisted requests are answered from
 * tests/fixtures/now-playing/<name>.json instead of the network, so the
 * whole path (client, projection, cache, page, API, poller) runs with no
 * credential and no call to Spotify. The release check refuses the switch
 * on Vercel (scripts/check-release.mjs).
 */
export const FIXTURE_DIR = "tests/fixtures/now-playing";

type Answer = { status: number; headers?: Record<string, string>; body?: unknown };
type Fixture = { token: Answer; read: Answer };

export function fixtureFetch(env: Env): FetchImpl | null {
  const name = env.NOW_PLAYING_FIXTURE ?? "";
  if (!name || env.ALLOW_CONTENT_FIXTURES !== "true" || env.VERCEL) return null;
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error("NOW_PLAYING_FIXTURE must be a fixture name");
  return async (url, init) => {
    assertAllowed(url, init.method);
    // Read per request, so a test can change what the synthetic Spotify answers.
    const f = JSON.parse(readFileSync(join(process.cwd(), FIXTURE_DIR, `${name}.json`), "utf8")) as Fixture;
    const a = url === TOKEN_URL ? f.token : f.read;
    const body = a.body === undefined ? null : typeof a.body === "string" ? a.body : JSON.stringify(a.body);
    return new Response(a.status === 204 ? null : body, { status: a.status, headers: { "Content-Type": "application/json", ...a.headers } });
  };
}
