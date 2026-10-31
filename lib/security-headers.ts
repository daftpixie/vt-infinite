import { collectionEnabled, scriptSource } from "./pulse/config";
import type { Env } from "./flags";

/** A precise public installation path and collection endpoint; no origin-wide script permission. */
export function plausibleCspSources(src: string | null): { script: string; connect: string } {
  if (!src || scriptSource({ PLAUSIBLE_SCRIPT_SRC: src }) !== src) return { script: "", connect: "" };
  return { script: ` ${src}`, connect: " https://plausible.io/api/event" };
}

/**
 * Response headers for every route. The script policy allows inline
 * scripts because Next.js emits inline bootstrap scripts; moving to a
 * nonce-based policy is tracked for the cutover stage.
 */
export function securityHeaders(isDev: boolean, env: Env = process.env): Array<{ key: string; value: string }> {
  const plausible = plausibleCspSources(collectionEnabled(env) ? scriptSource(env) : null);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${plausible.script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${plausible.connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
