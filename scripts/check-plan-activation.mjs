#!/usr/bin/env node
// Runs before every build (`prebuild`). When PLAN_ENABLED is "true" in the
// build's environment, it runs the plan activation gate
// (tests/unit/plan-activation.test.tsx) and fails the build if any
// placeholder would render on /plan/onerhythm or in Home's plan block. With
// the plan off it does nothing. See docs/ops/plan.md, "Activation order".
import { spawnSync } from "node:child_process";

if (process.env.PLAN_ENABLED !== "true") {
  console.log("plan activation check: PLAN_ENABLED is not on; nothing to check.");
} else {
  console.log("plan activation check: PLAN_ENABLED is on; checking that no placeholder renders on the plan's surfaces.");
  const run = spawnSync("npx", ["--no-install", "vitest", "run", "tests/unit/plan-activation.test.tsx"], { stdio: "inherit", env: process.env });
  if (run.status !== 0) {
    console.error("plan activation check: FAILED. Supply the approved plan description (P11) in a pull request before turning PLAN_ENABLED on (docs/ops/plan.md).");
    process.exit(1);
  }
  console.log("plan activation check: passed.");
}
