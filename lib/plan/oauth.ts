import { createHash } from "node:crypto";
import { z } from "zod";
import { PlanReadError, type FetchImpl } from "./asana";

/**
 * Short-lived access tokens for the plan reader (PRD A-2).
 *
 * The dedicated Asana account authorizes the OAuth app once, with the
 * tasks:read scope, by hand (docs/ops/plan.md). The server keeps only the
 * resulting refresh token, in the host's environment, and exchanges it here
 * for an access token. This is the only non-GET request in the plan code,
 * and it goes to the OAuth token endpoint, never to the Asana API. Access
 * tokens live in memory only and are never stored or logged.
 */
export const TOKEN_URL = "https://app.asana.com/-/oauth_token";
/** Out-of-band redirect: the code is shown to the person authorizing, not sent to the site. */
export const DEFAULT_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export type OAuthConfig = { clientId: string; clientSecret: string; refreshToken: string; redirectUri: string };

const TokenResponse = z.object({
  access_token: z.string().min(1).max(4096),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().max(86_400),
  refresh_token: z.string().optional(),
});

let cached: { configHash: string; token: string; expiresAt: number } | null = null;

const hashConfig = (c: OAuthConfig) => createHash("sha256").update(`${c.clientId}\n${c.refreshToken}`).digest("hex");

/** Tests start from an empty cache. */
export function resetTokenCacheForTests(): void {
  cached = null;
}

export async function getAccessToken(
  cfg: OAuthConfig,
  deps: { fetchImpl?: FetchImpl; now?: () => Date; log?: (m: string) => void } = {},
): Promise<string> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const log = deps.log ?? ((m: string) => console.warn(m));
  const configHash = hashConfig(cfg);
  if (cached && cached.configHash === configHash && cached.expiresAt - 60_000 > now) return cached.token;

  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        refresh_token: cfg.refreshToken,
      }).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new PlanReadError("token: network");
  }
  // 400/401 usually mean the grant was revoked or the refresh token is wrong.
  if (!res.ok) throw new PlanReadError(`token: HTTP ${res.status}`);
  let parsed;
  try {
    parsed = TokenResponse.safeParse(await res.json());
  } catch {
    throw new PlanReadError("token: not JSON");
  }
  if (!parsed.success) throw new PlanReadError("token: unexpected shape");
  if (parsed.data.refresh_token && parsed.data.refresh_token !== cfg.refreshToken) {
    // Never the value: only that the stored one should be replaced.
    log("plan: Asana returned a different refresh token; replace ASANA_PLAN_REFRESH_TOKEN (docs/ops/plan.md)");
  }
  cached = { configHash, token: parsed.data.access_token, expiresAt: now + parsed.data.expires_in * 1000 };
  return cached.token;
}
