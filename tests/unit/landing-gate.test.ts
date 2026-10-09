import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The route-level half of the landing gate (L1). The proxy denies every
 * path outside the landing release; each full-site page and route handler
 * also answers 404 by itself in landing mode, so neither layer is the only
 * one.
 */
const routeFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /(^|\/)(page\.tsx|route\.ts)$/.test(f));

/** Routes that serve the landing release, and so check the mode themselves. */
const LANDING_ROUTES: Record<string, RegExp> = {
  "app/page.tsx": /if \(isLanding\(\)\) return <LandingPage \/>;/,
  "app/privacy/page.tsx": /^export default async function PrivacyPage\(\) \{\n  await connection\(\);\n  landingOnly\(\);\n[\s\S]*^export function generateMetadata\(\): Metadata \{\n  landingOnly\(\);\n|^export function generateMetadata\(\): Metadata \{\n  landingOnly\(\);\n[\s\S]*^export default async function PrivacyPage\(\) \{\n  await connection\(\);\n  landingOnly\(\);\n/m,
  "app/robots.txt/route.ts": /if \(!isLanding\(\)\) return new Response\(null, \{ status: 404 \}\);/,
};

/** Routes that answer 404 to everything, in every mode, until stage 6. */
const ALWAYS_404 = ["app/admin/[[...path]]/page.tsx", "app/api/admin/[[...path]]/route.ts"];

describe("the full-site pages with metadata are found", () => {
  it("covers static and dynamic pages", () => {
    const withMeta = routeFiles.filter((f) => /generateMetadata/.test(readFileSync(f, "utf8")));
    expect(withMeta.length).toBeGreaterThan(15);
  });
});

describe("every full-site route answers 404 by itself in landing mode", () => {
  it("finds the routes", () => {
    expect(routeFiles.length).toBeGreaterThan(25);
  });

  it.each(routeFiles)("%s", (file) => {
    const src = readFileSync(file, "utf8");
    if (LANDING_ROUTES[file]) {
      expect(src).toMatch(LANDING_ROUTES[file]);
    } else if (ALWAYS_404.includes(file)) {
      expect(src).toMatch(/notFound\(\);\n\}|status: 404/);
    } else if (file.endsWith("page.tsx")) {
      // First statement, or straight after `await connection()`.
      expect(src).toMatch(/^export default (async )?function [^\n]*\{\n(  await connection\(\);\n)?  fullSiteOnly\(\);\n/m);
      // Metadata too (F3): a landing 404 never carries a full-site title or
      // description, so a page's metadata is generateMetadata, and it calls
      // fullSiteOnly() first.
      expect(src).not.toMatch(/^export const metadata\b/m);
      if (/^export (async )?function generateMetadata/m.test(src)) {
        expect(src).toMatch(/^export (async )?function generateMetadata\([^\n]*\{\n  fullSiteOnly\(\);\n/m);
      }
    } else {
      // Every handler that does work is GET; the others are plain 404s.
      expect(src).toMatch(/^export async function GET\([^\n]*\{\n  const landing = landingNotFound\(\);\n  if \(landing\) return landing;\n/m);
      expect(src.match(/^export (async )?function (?!GET)/gm) ?? []).toEqual([]);
    }
  });
});

describe("the test-only switch that builds without the proxy (F5)", () => {
  it("is fixed into every build: empty unless the build asked for it", async () => {
    const { default: config } = await import("@/next.config");
    expect(process.env.VT_TEST_BUILD_WITHOUT_PROXY).toBeUndefined();
    // Always defined, so Next.js replaces it at build time and the run-time environment cannot reach it.
    expect(config.env).toEqual({ VT_PROXY_DISABLED: "" });
    expect(config.distDir).toBeUndefined();
  });

  it("is read only by proxy.ts, as its first statement", () => {
    const src = readFileSync("proxy.ts", "utf8");
    expect(src).toMatch(/export function proxy\(request: NextRequest\) \{\n(\s*\/\/[^\n]*\n)*  if \(process\.env\.VT_PROXY_DISABLED === "1"\) return NextResponse\.next\(\);\n/);
    const users = execFileSync("git", ["grep", "-l", "VT_PROXY_DISABLED", "--", ":!tests", ":!docs"], { encoding: "utf8" }).trim().split("\n");
    expect(users.sort()).toEqual(["next.config.ts", "proxy.ts"]);
  });
});
