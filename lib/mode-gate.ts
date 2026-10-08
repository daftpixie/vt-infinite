import { notFound } from "next/navigation";
import { isLanding } from "./mode";

/**
 * The route-level half of the landing gate (proxy.ts is the other). Pages
 * that belong only to the full site call this first; route handlers return
 * `landingNotFound()` instead. tests/unit/landing-gate.test.ts checks that
 * every route under app/ does one or the other.
 */
export function fullSiteOnly(): void {
  if (isLanding()) notFound();
}

/** Pages that exist only in the landing release. */
export function landingOnly(): void {
  if (!isLanding()) notFound();
}

/** For route handlers: a plain 404 in landing mode, otherwise null. */
export function landingNotFound(): Response | null {
  return isLanding() ? new Response(null, { status: 404 }) : null;
}
