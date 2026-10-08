import legacy from "@/content/legacy/urls.json" with { type: "json" };
import { DEMO_ENTITY_ID, isEnabled, type Env, type Flag } from "./flags";
import { isLanding, LANDING_PATHS } from "./mode";

export type Decision =
  | { action: "pass" }
  | { action: "deny"; reason: "admin" | "flag" | "landing"; flag?: Flag }
  | { action: "gone" };

/** Path prefixes held behind a feature flag. A prefix matches itself and its children. */
export const GATED_PREFIXES: ReadonlyArray<{ prefix: string; flag: Flag }> = [
  { prefix: "/plan/onerhythm", flag: "plan" },
  { prefix: "/api/plan", flag: "plan" },
  { prefix: "/api/comments", flag: "comments" },
  { prefix: "/api/playlist", flag: "playlist" },
  { prefix: "/vibes/playlist", flag: "playlist" },
  { prefix: "/governance/demo", flag: "governanceDemo" },
  { prefix: "/api/governance/demo", flag: "governanceDemo" },
  { prefix: "/governance/live", flag: "governanceLive" },
  { prefix: "/api/governance/live", flag: "governanceLive" },
  { prefix: "/figures/mandelbrot", flag: "mandelbrot" },
];

/** Marrs Rover child segments that are not entity IDs. */
const ROVER_STATIC = new Set(["method", "verify", "verifier"]);

function normalise(pathname: string): string {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes are compared as received.
  }
  p = p.toLowerCase().replace(/\/{2,}/g, "/");
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function realRoverFlag(path: string): boolean {
  for (const base of ["/marrs-rover", "/api/marrs-rover"]) {
    if (!path.startsWith(`${base}/`)) continue;
    const [first, second] = path.slice(base.length + 1).split("/");
    if (!first || ROVER_STATIC.has(first)) return false;
    if (first === "reviews") return !(second ?? "").startsWith(`${DEMO_ENTITY_ID}-`);
    return first !== DEMO_ENTITY_ID;
  }
  return false;
}

/**
 * Decide what the edge does with a request before any page renders.
 * Admin is denied outright until stage 6. Flagged features are denied
 * unless their flag is on. Retired legacy paths are gone (410).
 *
 * In landing mode (lib/mode.ts) only the landing paths pass. The old-URL
 * table still applies: retired paths stay 410, and the redirects in
 * next.config.ts run before this.
 */
export function decide(pathname: string, env: Env = process.env): Decision {
  const path = normalise(pathname);

  if (isLanding(env)) {
    if (isGone(path)) return { action: "gone" };
    return LANDING_PATHS.includes(path) ? { action: "pass" } : { action: "deny", reason: "landing" };
  }

  if (under(path, "/admin") || under(path, "/api/admin")) {
    return { action: "deny", reason: "admin" };
  }
  for (const { prefix, flag } of GATED_PREFIXES) {
    if (under(path, prefix) && !isEnabled(flag, env)) return { action: "deny", reason: "flag", flag };
  }
  if (realRoverFlag(path) && !isEnabled("marrsRoverRealData", env)) {
    return { action: "deny", reason: "flag", flag: "marrsRoverRealData" };
  }
  if (isGone(path)) return { action: "gone" };
  return { action: "pass" };
}

function isGone(path: string): boolean {
  if (legacy.gone.includes(path)) return true;
  if (path.startsWith("/the-record/")) {
    const slug = path.slice("/the-record/".length);
    if ((legacy.goneRecordSlugs as string[]).includes(slug)) return true;
  }
  return false;
}
