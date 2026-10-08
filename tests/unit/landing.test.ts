import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/content/landing.json" with { type: "json" };
import { decide } from "@/lib/access";
import { FLAGS } from "@/lib/flags";
import { acrosticHeading, acrosticSentence, acrosticThreshold, LANDING, parseLanding } from "@/lib/landing";
import { isLanding, LANDING_PATHS, siteMode, siteModeValueIsValid } from "@/lib/mode";
import { ROUTES } from "@/lib/routes";

const LANDING_ENV = { SITE_MODE: "landing" };
const ALL_ON = Object.fromEntries(Object.values(FLAGS).map((k) => [k, "true"]));

describe("site mode", () => {
  it.each([
    [undefined, "full", true],
    ["", "full", true],
    ["full", "full", true],
    ["landing", "landing", true],
    // A typo must not open the full site.
    ["Landing", "landing", false],
    ["landng", "landing", false],
    ["true", "landing", false],
  ])("SITE_MODE=%s is %s (valid: %s)", (value, mode, valid) => {
    const env = value === undefined ? {} : { SITE_MODE: value };
    expect(siteMode(env)).toBe(mode);
    expect(isLanding(env)).toBe(mode === "landing");
    expect(siteModeValueIsValid(env)).toBe(valid);
  });
});

describe("landing copy (amendment A1.3), verbatim from content/landing.json", () => {
  it("reads across as one heading", () => {
    expect(acrosticHeading(LANDING.acrostic)).toBe("Heart. Mind. Hands.");
  });

  it("reads down as three sentences, in order", () => {
    expect(LANDING.acrostic.map(acrosticSentence)).toEqual(["Heart defines the purpose.", "Mind defines the method.", "Hands build the hope."]);
    expect(LANDING.acrostic.map((i) => i.down)).toEqual([
      ["defines", "the", "purpose."],
      ["defines", "the", "method."],
      ["build", "the", "hope."],
    ]);
  });

  it("carries the motto, the footer and the links Matthew chose", () => {
    expect(LANDING.motto).toBe("ad astra per aspera");
    expect(LANDING.legalName).toBe("VT Infinite, Inc.");
    expect(LANDING.contactEmail).toBe("matthew@vt-infinite.com");
    expect(LANDING.signupClosed).toBe("Updates sign-up opens soon");
    // Each publication stays on its substack.com address until its custom domain is verified in Substack.
    expect(LANDING.links).toEqual([
      { label: "The Human Butterfly", href: "https://everydecimal.substack.com", customDomain: "https://www.thehumanbutterfly.dev" },
      { label: "Incentive Eyes", href: "https://incentiveeyes.substack.com", customDomain: "https://incentiveeyes.vt-infinite.com" },
      { label: "The VT Infinite Discord", href: "https://discord.gg/zkdFVqG4Gz" },
    ]);
  });

  it("switching a publication to its custom domain is a valid one-line change", () => {
    const switched = structuredClone(raw);
    switched.links[0]!.href = "https://www.thehumanbutterfly.dev";
    expect(parseLanding(switched).links[0]!.href).toBe("https://www.thehumanbutterfly.dev");
  });

  it("sets the stacking threshold from the longest word", () => {
    expect(acrosticThreshold(LANDING.acrostic)).toBe("calc(27ch + 4rem)");
  });
});

describe("landing configuration is validated", () => {
  const bad = (mutate: (c: typeof raw) => void) => {
    const c = structuredClone(raw);
    mutate(c);
    return () => parseLanding(c);
  };
  it.each([
    ["an http link", (c: typeof raw) => void (c.links[0]!.href = "http://everydecimal.substack.com")],
    ["a javascript: link", (c: typeof raw) => void (c.links[0]!.href = "javascript:alert(1)")],
    ["a link with a query", (c: typeof raw) => void (c.links[2]!.href = "https://discord.gg/zkdFVqG4Gz?x=1")],
    ["a link with credentials", (c: typeof raw) => void (c.links[2]!.href = "https://a:b@discord.gg/zkdFVqG4Gz")],
    ["a link to an IP address", (c: typeof raw) => void (c.links[2]!.href = "https://192.0.2.1/")],
    ["a period on the across word", (c: typeof raw) => void (c.acrostic[0]!.across = "Heart.")],
    ["a sentence without a period", (c: typeof raw) => void (c.acrostic[0]!.down = ["defines", "the", "purpose"])],
    ["two words in one line", (c: typeof raw) => void (c.acrostic[0]!.down = ["defines the", "purpose."])],
    ["markup in a word", (c: typeof raw) => void (c.acrostic[0]!.down = ["<b>defines</b>", "the", "purpose."])],
    ["a bad contact address", (c: typeof raw) => void (c.contactEmail = "matthew")],
    ["an unknown key", (c: typeof raw) => void ((c as Record<string, unknown>).extra = "x")],
  ])("rejects %s", (_name, mutate) => {
    expect(bad(mutate)).toThrow();
  });
});

describe("landing mode access (proxy decision)", () => {
  it("passes exactly the landing paths, with flags off or on", () => {
    for (const env of [LANDING_ENV, { ...ALL_ON, ...LANDING_ENV }]) {
      for (const p of LANDING_PATHS) expect(decide(p, env), p).toEqual({ action: "pass" });
    }
  });

  it("agrees with lib/routes.ts: the landing column's 200s are the landing paths", () => {
    expect(ROUTES.filter((r) => r.landing === 200).map((r) => r.path).sort()).toEqual([...LANDING_PATHS].sort());
  });

  it("denies every other route in lib/routes.ts, even with every flag on", () => {
    for (const r of ROUTES.filter((x) => x.landing === 404)) {
      expect(decide(r.path, { ...ALL_ON, ...LANDING_ENV }), r.path).toEqual({ action: "deny", reason: "landing" });
    }
  });

  it.each([
    "/words", "/WORDS", "/words/", "/the-record/feed.xml", "/api/cron/refresh", "/api/plan/onerhythm", "/admin", "/contact",
    "/policies/privacy", "/marrs-rover/verifier/marrs-rover-verifier.tar", "/brand/vt-infinite-lockup-stacked.svg", "/does-not-exist",
    "/privacy/x", "/%2e%2e/privacy", "//words", "/agency",
  ])("denies %s", (path) => {
    expect(decide(path, LANDING_ENV)).toEqual({ action: "deny", reason: "landing" });
  });

  it("keeps the old-URL table: retired paths stay 410", () => {
    expect(decide("/phial", LANDING_ENV)).toEqual({ action: "gone" });
  });

  it("leaves full mode unchanged", () => {
    expect(decide("/words", {})).toEqual({ action: "pass" });
    expect(decide("/privacy", {})).toEqual({ action: "pass" }); // the page itself answers 404 outside landing mode
  });
});

describe("the stacked lockup is the approved file, unchanged", () => {
  it("is inlined exactly as public/brand holds it, labelled VT Infinite", async () => {
    const { lockupSvg } = await import("@/components/landing/BrandLockup");
    const file = readFileSync("public/brand/vt-infinite-lockup-stacked.svg", "utf8").trim();
    expect(lockupSvg()).toBe(file);
    expect(file).toMatch(/^<svg [^>]*role="img" aria-label="VT Infinite"><title>VT Infinite<\/title>/);
  });
});
