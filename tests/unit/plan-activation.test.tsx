import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePlan } from "@/components/HomePlan";
import { Placeholder } from "@/components/Placeholder";
import { PLACEHOLDERS, type PlaceholderId } from "@/lib/placeholders";
import { readPlan } from "@/lib/plan/service";
import { setSnapshotStoreForTests } from "@/lib/storage";
import { FileSnapshotStore } from "@/lib/storage/file";

/**
 * Plan activation gate (P11, docs/ops/plan.md). Before PLAN_ENABLED is
 * turned on, the approved plan description replaces the placeholder. With
 * the plan on, no placeholder may render on /plan/onerhythm or in Home's
 * plan block.
 *
 * The gate itself runs only where PLAN_ENABLED is "true" in the real
 * environment: the production build runs this file first in that case
 * (scripts/check-plan-activation.mjs, the `prebuild` script), so a deploy
 * with the plan on and a placeholder still in place fails to build. CI runs
 * with the plan off and checks that the gate can see what it must.
 */

// Pages call connection(); outside a request it is a no-op here.
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

const PLAN_ON_HERE = process.env.PLAN_ENABLED === "true";

function placeholderIds(html: string): string[] {
  return [...html.matchAll(/data-placeholder="([^"]+)"/g)].map((m) => m[1] as string);
}

/** The plan's public surfaces, rendered with the plan on over a synthetic stored projection. */
async function planSurfaces() {
  setSnapshotStoreForTests(new FileSnapshotStore("tests/fixtures/plan-snapshots"));
  vi.stubEnv("PLAN_ENABLED", "true");
  const page = renderToStaticMarkup(await (await import("@/app/plan/onerhythm/page")).default());
  const home = renderToStaticMarkup(await (await import("@/app/page")).default());
  const homePlan = renderToStaticMarkup(<HomePlan state={await readPlan()} />);
  return { page, home, homePlan };
}

afterEach(() => {
  vi.unstubAllEnvs();
  setSnapshotStoreForTests(null);
});

describe("plan activation gate (P11)", () => {
  it("renders the surfaces it checks: the plan page and Home's plan block, with the plan shown", async () => {
    const { page, home, homePlan } = await planSurfaces();
    expect(page).toContain("Synthetic plan initiative (fixture)");
    expect(homePlan).toContain("Synthetic plan initiative (fixture)");
    expect(homePlan).toContain('href="/plan/onerhythm"');
    // Home renders exactly this block, so checking the block checks Home.
    expect(home).toContain(homePlan);
  });

  it("sees a placeholder wherever one renders, block or inline", () => {
    const [id] = Object.keys(PLACEHOLDERS) as PlaceholderId[];
    if (!id) return; // Nothing left to supply anywhere.
    const html = renderToStaticMarkup(
      <>
        <Placeholder id={id} />
        <p>
          <Placeholder id={id} inline />
        </p>
      </>,
    );
    expect(placeholderIds(html)).toEqual([id, id]);
  });

  it("the build runs the check first, and with the plan off it does nothing", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.prebuild).toBe("node scripts/check-plan-activation.mjs");
    const run = spawnSync(process.execPath, ["scripts/check-plan-activation.mjs"], { env: { ...process.env, PLAN_ENABLED: "" }, encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("PLAN_ENABLED is not on; nothing to check.");
  });

  it.runIf(PLAN_ON_HERE)("with PLAN_ENABLED on, no placeholder renders on /plan/onerhythm or in Home's plan block", async () => {
    const { page, homePlan } = await planSurfaces();
    expect(placeholderIds(page), "placeholders on /plan/onerhythm").toEqual([]);
    expect(placeholderIds(homePlan), "placeholders in Home's plan block").toEqual([]);
  });
});
