/**
 * Server-side feed fetch with the limits PRD SS-2 sets: a ten-second
 * timeout, a response-size cap, an identifying user agent, conditional
 * requests, and no redirects (a redirect could leave the allowlisted host).
 */
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export const USER_AGENT = "vt-infinite.com feed reader (+https://vt-infinite.com)";

export type FetchOutcome =
  | { kind: "ok"; body: string; etag: string | null; lastModified: string | null }
  | { kind: "not-modified" }
  | { kind: "error"; reason: "timeout" | "network" | "status" | "too-large" | "content-type" };

export type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export async function fetchFeed(
  url: string,
  opts: { etag?: string | null; lastModified?: string | null; fetchImpl?: FetchImpl; timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchOutcome> {
  const { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_FEED_BYTES } = opts;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
  };
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;

  let res: Response;
  try {
    res = await fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    return { kind: "error", reason: (err as Error)?.name === "TimeoutError" ? "timeout" : "network" };
  }
  if (res.status === 304) return { kind: "not-modified" };
  if (!res.ok) return { kind: "error", reason: "status" };
  const type = res.headers.get("content-type") ?? "";
  // A missing or empty content type is refused too: only declared XML is parsed.
  if (!/xml/i.test(type)) return { kind: "error", reason: "content-type" };
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { kind: "error", reason: "too-large" };

  const reader = res.body?.getReader();
  if (!reader) return { kind: "error", reason: "network" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { kind: "error", reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch (err) {
    return { kind: "error", reason: (err as Error)?.name === "TimeoutError" ? "timeout" : "network" };
  }
  const body = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  return { kind: "ok", body, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
}
