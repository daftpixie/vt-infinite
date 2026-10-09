import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { NextConfig } from "next";
import { LANDING_FONTS, LANDING_PATHS } from "./lib/mode";
import { securityHeaders } from "./lib/security-headers";

function publicFiles(dir = "public"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? publicFiles(join(dir, e.name)) : [`/${relative("public", join(dir, e.name)).split(sep).join("/")}`]));
}

/**
 * A landing build (SITE_MODE=landing when it runs) also hides every file in
 * public/ that the landing release does not use, without relying on
 * proxy.ts: each is rewritten, before the file is served, to a path with no
 * route, which answers 404. A full build started in landing mode (as the
 * end-to-end suite does) relies on the proxy for these.
 */
function landingHiddenFiles(): string[] {
  if (process.env.SITE_MODE !== "landing") return [];
  const allowed = new Set([...LANDING_PATHS, ...LANDING_FONTS]);
  return publicFiles().filter((f) => !allowed.has(f));
}

/**
 * Test-only: VT_TEST_BUILD_WITHOUT_PROXY=1 builds the site with proxy.ts
 * switched off, into its own directory, so the end-to-end suite can prove
 * the route-level landing gate on its own (tests/e2e/landing-noproxy.spec.ts).
 * VT_PROXY_DISABLED is always defined here, so Next.js fixes its value into
 * the build; it cannot be switched on at run time. scripts/check-release.mjs
 * refuses the switch on Vercel.
 */
const WITHOUT_PROXY = process.env.VT_TEST_BUILD_WITHOUT_PROXY === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { VT_PROXY_DISABLED: WITHOUT_PROXY ? "1" : "" },
  ...(WITHOUT_PROXY ? { distDir: ".next-noproxy" } : {}),
  // Content files are read at request time; ship them with the server bundle.
  // Marrs Rover reads its sealed bundles, and builds the verifier download, from the repository at request time.
  // The landing page inlines the stacked lockup from public/brand.
  outputFileTracingIncludes: { "/**": ["./content/**/*", "./fixtures/marrs-rover/bundles/**/*", "./tools/ledger-verifier/**/*", "./public/brand/vt-infinite-lockup-stacked.svg"] },
  reactStrictMode: true,
  async rewrites() {
    return { beforeFiles: landingHiddenFiles().map((source) => ({ source, destination: "/_landing-not-found" })), afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(process.env.NODE_ENV === "development"),
      },
    ];
  },
};

export default nextConfig;
