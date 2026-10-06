import { describe, expect, it } from "vitest";
import { CRISIS_TEXT } from "@/guards/rules.mjs";
import { CRISIS_SUPPORT_TEXT } from "@/lib/crisis";

describe("crisis-support wording", () => {
  it("is the house wording, verbatim", () => {
    expect(CRISIS_SUPPORT_TEXT).toBe(
      "If you are thinking about suicide, call or text 988 in the US, or your local crisis line. If your heart is in trouble right now, call 911 or your local emergency number, or follow the plan your care team gave you.",
    );
  });
  it("matches the copy the guards enforce", () => {
    expect(CRISIS_SUPPORT_TEXT).toBe(CRISIS_TEXT);
  });
});
