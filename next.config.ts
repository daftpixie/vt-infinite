import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Content files are read at request time; ship them with the server bundle.
  // Marrs Rover reads its sealed bundles, and builds the verifier download, from the repository at request time.
  // The landing page inlines the stacked lockup from public/brand.
  outputFileTracingIncludes: { "/**": ["./content/**/*", "./fixtures/marrs-rover/bundles/**/*", "./tools/ledger-verifier/**/*", "./public/brand/vt-infinite-lockup-stacked.svg"] },
  reactStrictMode: true,
  async redirects() {
    // Old URLs with a deliberate replacement (PRD DN-6). permanent => 308.
    return [
      { source: "/origin", destination: "/agency", permanent: true },
      { source: "/partners", destination: "/contact", permanent: true },
    ];
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
