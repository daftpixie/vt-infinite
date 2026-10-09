import { NextResponse, type NextRequest } from "next/server";
import { decide } from "@/lib/access";
import { gonePageHtml, landingNotFoundHtml } from "@/lib/gone";
import { isLanding } from "@/lib/mode";
import { securityHeaders } from "@/lib/security-headers";

function htmlResponse(html: string, status: number): NextResponse {
  const res = new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  for (const { key, value } of securityHeaders(process.env.NODE_ENV === "development")) {
    res.headers.set(key, value);
  }
  return res;
}

/**
 * Request-time gate in front of every route. Admin and flagged features
 * return 404 before anything renders; pages repeat the check, so neither
 * layer is the only one. In landing mode (lib/mode.ts) everything outside
 * the landing release is denied here the same way.
 */
export function proxy(request: NextRequest) {
  // Test-only: the route-level gate is checked on its own in a separate
  // build (next.config.ts, VT_TEST_BUILD_WITHOUT_PROXY). The value is
  // fixed when the build runs; a normal build fixes it to "".
  if (process.env.VT_PROXY_DISABLED === "1") return NextResponse.next();

  const decision = decide(request.nextUrl.pathname);

  if (decision.action === "deny") {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return new NextResponse(null, { status: 404 });
    }
    // Landing mode answers with its own page, which links only to `/`.
    if (decision.reason === "landing") return htmlResponse(landingNotFoundHtml(), 404);
    // A path with no route renders the site's not-found page with a 404.
    return NextResponse.rewrite(new URL("/_denied", request.url));
  }

  if (decision.action === "gone") {
    return htmlResponse(gonePageHtml(isLanding()), 410);
  }

  if (decision.action === "redirect") {
    // Same origin, query kept. Next.js sends a same-origin Location as a path.
    const to = new URL(decision.to, request.url);
    to.search = request.nextUrl.search;
    return NextResponse.redirect(to, 308);
  }

  return NextResponse.next();
}

// Everything but the build's own scripts and styles goes through the gate,
// public/ included: in landing mode only the files lib/mode.ts lists answer.
export const config = {
  matcher: ["/((?!_next/static/).*)"],
};
