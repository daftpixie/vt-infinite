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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico).*)"],
};
