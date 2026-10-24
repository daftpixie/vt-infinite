import { z } from "zod";
import type { Credentials } from "./config";

/**
 * Read-only Spotify client for "now playing" (PRD S-1 to S-3; ADR 0009).
 *
 * Exactly two requests can be built, and only by the two builders below:
 *
 *   POST https://accounts.spotify.com/api/token            (refresh_token grant)
 *   GET  https://api.spotify.com/v1/me/player/currently-playing
 *
 * There is no URL, host, path, method or query parameter to pass in.
 * `assertAllowed` checks every request against ALLOWED before it is sent,
 * so even a request assembled by hand elsewhere cannot leave the list.
 * Redirects are refused, every request has a deadline, and bodies are read
 * up to a size cap. The authorization was made once, by hand, with the
 * single scope `user-read-currently-playing` (docs/ops/now-playing.md).
 *
 * No token, code or secret is ever logged or returned in an error.
 */
export const TOKEN_URL = "https://accounts.spotify.com/api/token";
export const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
/** The only scope ever requested at authorization. */
export const SCOPE = "user-read-currently-playing";

export const ALLOWED: ReadonlyArray<{ method: "GET" | "POST"; url: string }> = [
  { method: "POST", url: TOKEN_URL },
  { method: "GET", url: CURRENTLY_PLAYING_URL },
];

/** Both requests together never take longer than this (N4: no visitor waits longer). */
export const CLIENT_TIMEOUT_MS = 2_500;
export const MAX_RESPONSE_BYTES = 128 * 1024;
/** Retry-After when Spotify sends none, and the longest wait honoured. */
export const DEFAULT_RETRY_AFTER_S = 60;
export const MAX_RETRY_AFTER_S = 24 * 60 * 60;

export type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export class DisallowedRequest extends Error {
  constructor() {
    super("request is not on the Spotify allowlist");
    this.name = "DisallowedRequest";
  }
}

type AllowedRequest = { url: string; init: RequestInit & { method: "GET" | "POST" } };

/** Throws unless method and URL are exactly one of ALLOWED. */
export function assertAllowed(url: string, method: string | undefined): void {
  if (!ALLOWED.some((a) => a.url === url && a.method === (method ?? "GET"))) throw new DisallowedRequest();
}

function tokenRequest(c: Pick<Credentials, "clientId" | "clientSecret" | "refreshToken">): AllowedRequest {
  return {
    url: TOKEN_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refreshToken }).toString(),
    },
  };
}

function currentlyPlayingRequest(accessToken: string): AllowedRequest {
  return { url: CURRENTLY_PLAYING_URL, init: { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } } };
}

type Raw = { status: number; headers: Headers; body: string } | { error: "timeout" | "network" | "too-large" };

async function send(req: AllowedRequest, fetchImpl: FetchImpl, signal: AbortSignal): Promise<Raw> {
  assertAllowed(req.url, req.init.method);
  let res: Response;
  try {
    res = await fetchImpl(req.url, { ...req.init, redirect: "error", signal, cache: "no-store" });
  } catch (err) {
    return { error: (err as Error)?.name === "TimeoutError" || signal.aborted ? "timeout" : "network" };
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return { error: "too-large" };
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          return { error: "too-large" };
        }
        chunks.push(value);
      }
    } catch {
      return { error: signal.aborted ? "timeout" : "network" };
    }
  }
  return { status: res.status, headers: res.headers, body: new TextDecoder("utf-8").decode(Buffer.concat(chunks)) };
}

function json(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Seconds from a Retry-After header: an integer, or the default; capped. */
export function retryAfterSeconds(header: string | null): number {
  const n = header !== null && /^\d{1,9}$/.test(header.trim()) ? Number(header.trim()) : DEFAULT_RETRY_AFTER_S;
  return Math.min(Math.max(n, 1), MAX_RETRY_AFTER_S);
}

/** A 429 whose body carries reason QUOTA_EXCEEDED is the account quota, not the rolling rate limit. */
function isQuota(body: string): boolean {
  const j = json(body) as { reason?: unknown; error?: { reason?: unknown } } | null;
  return j?.reason === "QUOTA_EXCEEDED" || j?.error?.reason === "QUOTA_EXCEEDED";
}

export type Failure =
  | { kind: "reconnect"; reason: "invalid_grant" | "invalid_client" }
  | { kind: "rate-limited"; retryAfterS: number; quota: boolean }
  | { kind: "unauthorized" }
  | { kind: "error"; reason: string };

const TokenResponse = z.object({
  access_token: z.string().min(1).max(4096),
  expires_in: z.number().int().positive().max(86_400),
  refresh_token: z.string().min(1).max(4096).optional(),
});

export type TokenResult = { kind: "token"; accessToken: string; expiresInS: number; newRefreshToken: string | null } | Failure;

/** Exchange the refresh token for an access token (refresh_token grant only). */
export async function refreshAccessToken(c: Credentials, deps: { fetchImpl: FetchImpl; signal: AbortSignal }): Promise<TokenResult> {
  const raw = await send(tokenRequest(c), deps.fetchImpl, deps.signal);
  if ("error" in raw) return { kind: "error", reason: `token ${raw.error}` };
  if (raw.status === 429) return { kind: "rate-limited", retryAfterS: retryAfterSeconds(raw.headers.get("retry-after")), quota: isQuota(raw.body) };
  if (raw.status === 400 || raw.status === 401) {
    const err = (json(raw.body) as { error?: unknown } | null)?.error;
    if (err === "invalid_grant" || err === "invalid_client") return { kind: "reconnect", reason: err };
    return { kind: "error", reason: `token status ${raw.status}` };
  }
  if (raw.status !== 200) return { kind: "error", reason: `token status ${raw.status}` };
  const parsed = TokenResponse.safeParse(json(raw.body));
  if (!parsed.success) return { kind: "error", reason: "token response shape" };
  const fresh = parsed.data.refresh_token;
  return { kind: "token", accessToken: parsed.data.access_token, expiresInS: parsed.data.expires_in, newRefreshToken: fresh && fresh !== c.refreshToken ? fresh : null };
}

export type ReadResult = { kind: "playing-body"; body: unknown } | { kind: "nothing" } | Failure;

/** GET the currently playing item. 204 is "nothing playing". */
export async function readCurrentlyPlaying(accessToken: string, deps: { fetchImpl: FetchImpl; signal: AbortSignal }): Promise<ReadResult> {
  const raw = await send(currentlyPlayingRequest(accessToken), deps.fetchImpl, deps.signal);
  if ("error" in raw) return { kind: "error", reason: `read ${raw.error}` };
  if (raw.status === 204) return { kind: "nothing" };
  if (raw.status === 401) return { kind: "unauthorized" };
  if (raw.status === 429) return { kind: "rate-limited", retryAfterS: retryAfterSeconds(raw.headers.get("retry-after")), quota: isQuota(raw.body) };
  if (raw.status !== 200) return { kind: "error", reason: `read status ${raw.status}` };
  // A 200 with an empty body is treated like 204.
  if (raw.body.trim() === "") return { kind: "nothing" };
  const body = json(raw.body);
  if (body === null || typeof body !== "object") return { kind: "error", reason: "read response shape" };
  return { kind: "playing-body", body };
}
