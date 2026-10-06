import { describe, expect, it } from "vitest";
import { decide } from "@/lib/access";
import { FLAGS } from "@/lib/flags";

const OFF = {};
const ALL_ON = Object.fromEntries(Object.values(FLAGS).map((k) => [k, "true"]));

describe("admin is denied everything", () => {
  it.each(["/admin", "/admin/", "/admin/comments", "/ADMIN", "/admin/x/y", "/api/admin", "/api/admin/settings", "//admin", "/%61dmin"])(
    "%s",
    (path) => {
      expect(decide(path, OFF)).toEqual({ action: "deny", reason: "admin" });
      expect(decide(path, ALL_ON)).toEqual({ action: "deny", reason: "admin" });
    },
  );
});

describe("flagged features return 404 when off", () => {
  const cases: Array<[string, string]> = [
    ["/plan/onerhythm", "plan"],
    ["/api/plan", "plan"],
    ["/api/comments", "comments"],
    ["/api/playlist/add", "playlist"],
    ["/vibes/playlist", "playlist"],
    ["/governance/demo", "governanceDemo"],
    ["/api/governance/demo/proposals", "governanceDemo"],
    ["/governance/live", "governanceLive"],
    ["/api/governance/live/ballots", "governanceLive"],
    ["/marrs-rover/vt-infinite-inc/periods/2026-q3", "marrsRoverRealData"],
    ["/marrs-rover/any-entity/events/1", "marrsRoverRealData"],
    ["/marrs-rover/reviews/r1", "marrsRoverRealData"],
    ["/api/marrs-rover/any-entity", "marrsRoverRealData"],
  ];
  it.each(cases)("%s needs %s", (path, flag) => {
    expect(decide(path, OFF)).toEqual({ action: "deny", reason: "flag", flag });
    expect(decide(path, ALL_ON)).toEqual({ action: "pass" });
  });
});

describe("public routes pass", () => {
  it.each(["/", "/governance", "/marrs-rover", "/marrs-rover/method", "/marrs-rover/verify", "/marrs-rover/demo/periods/q1", "/marrs-rover/reviews/demo-1", "/vibes", "/words/feed.xml"])(
    "%s",
    (path) => expect(decide(path, OFF)).toEqual({ action: "pass" }),
  );
});

describe("retired legacy URLs", () => {
  it("answers /phial with 410", () => {
    expect(decide("/phial", OFF)).toEqual({ action: "gone" });
    expect(decide("/phial/", OFF)).toEqual({ action: "gone" });
  });
  it("keeps the Record feed path", () => {
    expect(decide("/the-record/feed.xml", OFF)).toEqual({ action: "pass" });
  });
});
