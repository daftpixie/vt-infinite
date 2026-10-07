import { defineConfig, devices } from "@playwright/test";
import { FLAGS } from "./lib/flags";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** A second server with only the plan flag on. */
const PLAN_PORT = PORT + 1;

// Every feature flag is explicitly unset for the server under test, so the
// suite proves the default-off behavior rather than inheriting a shell value.
const serverEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !(Object.values(FLAGS) as string[]).includes(entry[0]),
    ),
  ),
  // Synthetic fixtures only; never contact upstream providers from tests.
  ESSAYS_DIR: "tests/fixtures/essays",
  RECORD_DIR: "tests/fixtures/record",
  ALLOW_CONTENT_FIXTURES: "true",
  SNAPSHOT_DIR: "tests/fixtures/snapshots",
  UPSTREAM_REFRESH: "off",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lets a machine with a preinstalled Chromium skip the download.
        launchOptions: process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
      },
    },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: serverEnv,
    },
    // The OneRhythm plan with its flag on, reading a synthetic stored
    // projection only (tests/fixtures/plan-snapshots). It never reaches Asana:
    // UPSTREAM_REFRESH is off and no plan credentials are set.
    {
      command: `npx next start -p ${PLAN_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PLAN_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...serverEnv, PLAN_ENABLED: "true", SNAPSHOT_DIR: "tests/fixtures/plan-snapshots" },
    },
  ],
});
