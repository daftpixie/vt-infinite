#!/usr/bin/env node
// Release checks. Runs before every build (`prebuild`), so a deploy whose
// environment would show a placeholder on a public route fails to build.
//
//   SITE_MODE   must be unset, "full" or "landing"; anything else fails.
//   landing     SITE_MODE=landing runs the landing release gate
//               (tests/unit/landing-release.test.tsx): no placeholder may
//               render on any route the landing release serves.
//   no proxy    VT_TEST_BUILD_WITHOUT_PROXY (a test-only build with
//               proxy.ts switched off, next.config.ts) fails on Vercel.
//   plan        PLAN_ENABLED=true runs the plan activation gate
//               (tests/unit/plan-activation.test.tsx): no placeholder on
//               /plan/onerhythm or in Home's plan block. docs/ops/plan.md,
//               "Activation order".
//
// With SITE_MODE unset and the plan off it checks nothing else.
import { spawnSync } from "node:child_process";

const KNOWN_MODES = ["", "full", "landing"];
const mode = process.env.SITE_MODE ?? "";
let failed = false;

function gate(name, testFile, hint) {
  console.log(`release check: ${name}: checking that no placeholder renders.`);
  const run = spawnSync("npx", ["--no-install", "vitest", "run", testFile], { stdio: "inherit", env: process.env });
  if (run.status !== 0) {
    console.error(`release check: ${name}: FAILED. ${hint}`);
    failed = true;
  } else {
    console.log(`release check: ${name}: passed.`);
  }
}

if (process.env.VT_TEST_BUILD_WITHOUT_PROXY && process.env.VERCEL) {
  console.error("release check: VT_TEST_BUILD_WITHOUT_PROXY switches the proxy off for tests and must never be set on Vercel. FAILED.");
  failed = true;
}

if (!KNOWN_MODES.includes(mode)) {
  console.error(`release check: SITE_MODE must be unset, "full" or "landing" (got a value of ${mode.length} characters). FAILED.`);
  failed = true;
} else if (mode === "landing") {
  gate("landing release", "tests/unit/landing-release.test.tsx", "Supply the missing copy (lib/placeholders.ts lists each gap) in a pull request before building with SITE_MODE=landing.");
} else {
  console.log("release check: SITE_MODE is not landing; nothing to check for the landing release.");
}

if (process.env.PLAN_ENABLED !== "true") {
  console.log("release check: PLAN_ENABLED is not on; nothing to check.");
} else {
  gate("plan activation", "tests/unit/plan-activation.test.tsx", "Supply the approved plan description (P11) in a pull request before turning PLAN_ENABLED on (docs/ops/plan.md).");
}

process.exit(failed ? 1 : 0);
