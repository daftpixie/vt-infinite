import { describe, expect, it } from "vitest";
import { FLAGS, isEnabled, type Flag } from "@/lib/flags";

const ALL = Object.keys(FLAGS) as Flag[];

describe("feature flags", () => {
  it("covers every flag the kickoff names, plus the Mandelbrot hold (P7)", () => {
    expect(Object.values(FLAGS).sort()).toEqual(
      [
        "COMMENTS_ENABLED",
        "GOVERNANCE_DEMO_ENABLED",
        "GOVERNANCE_LIVE_ENABLED",
        "MANDELBROT_ENABLED",
        "MARRS_ROVER_REAL_DATA_ENABLED",
        "PLAN_ENABLED",
        "PLAYLIST_ENABLED",
      ].sort(),
    );
  });

  it.each(ALL)("%s is off when unset", (flag) => {
    expect(isEnabled(flag, {})).toBe(false);
  });

  it.each(["", "false", "TRUE", "True", "1", "yes", "on", " true", "true "])("treats %j as off", (value) => {
    for (const flag of ALL) expect(isEnabled(flag, { [FLAGS[flag]]: value })).toBe(false);
  });

  it("is on only for the exact string true", () => {
    for (const flag of ALL) expect(isEnabled(flag, { [FLAGS[flag]]: "true" })).toBe(true);
  });

  it("does not let one flag turn on another", () => {
    expect(isEnabled("governanceLive", { GOVERNANCE_DEMO_ENABLED: "true" })).toBe(false);
  });
});
