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
  "app/privacy/page.tsx": /^\s+landingOnly\(\);$/m,
  "app/robots.txt/route.ts": /if \(!isLanding\(\)\) return new Response\(null, \{ status: 404 \}\);/,
};

/** Routes that answer 404 to everything, in every mode, until stage 6. */
const ALWAYS_404 = ["app/admin/[[...path]]/page.tsx", "app/api/admin/[[...path]]/route.ts"];

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
    } else {
      // Every handler that does work is GET; the others are plain 404s.
      expect(src).toMatch(/^export async function GET\([^\n]*\{\n  const landing = landingNotFound\(\);\n  if \(landing\) return landing;\n/m);
      expect(src.match(/^export (async )?function (?!GET)/gm) ?? []).toEqual([]);
    }
  });
});
