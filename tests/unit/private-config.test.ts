import { describe, expect, it } from "vitest";
import { privateConfigStatus } from "@/scripts/check-private-config.mjs";

const REPO = "daftpixie/vt-infinite";

describe("CI requires the PRIVATE_IDENTIFIERS secret", () => {
  it.each([
    ["push", undefined],
    ["pull_request", REPO],
    ["workflow_dispatch", undefined],
  ])("fails when empty on %s from this repository", (eventName, headRepository) => {
    for (const value of [undefined, "", " , ", "ab"]) {
      expect(privateConfigStatus({ eventName, repository: REPO, headRepository, value }).status).toBe("fail");
    }
  });

  it("warns and continues on a pull request from a fork", () => {
    const r = privateConfigStatus({ eventName: "pull_request", repository: REPO, headRepository: "someone/vt-infinite", value: "" });
    expect(r.status).toBe("skip-fork");
    expect(r.message).toMatch(/skipped/);
  });

  it("passes when set, without echoing the value", () => {
    const r = privateConfigStatus({ eventName: "push", repository: REPO, value: "synthetic-value-xyz" });
    expect(r.status).toBe("ok");
    expect(r.message).not.toContain("synthetic-value-xyz");
  });
});
