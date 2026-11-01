import { spawnSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NowPlayingBody } from "@/components/now-playing/NowPlayingBody";
import type { NowPlayingView } from "@/lib/now-playing/projection";
import { privacyNoticeVersion } from "@/lib/privacy";
import { ALBUM_URL, ARTIST_URL, TRACK_URL } from "./now-playing-synthetic";

/**
 * Now-playing release gate (ADR 0009, N10). With NOW_PLAYING_ENABLED=true
 * the build runs this file first (scripts/check-release.mjs, `prebuild`) and
 * fails unless:
 *
 * - /privacy serves the notice matching the enabled features, with its Spotify sentences, and
 * - no placeholder renders in the component, in any state.
 *
 * CI runs with the flag off and checks that the gate sees what it must.
 * The official Spotify logo closed the last gap (ADR 0009, "Logo").
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

const NOW_PLAYING_HERE = process.env.NOW_PLAYING_ENABLED === "true";

const TRACK = { name: "Synthetic Track", url: TRACK_URL, artists: [{ name: "Synthetic Artist", url: ARTIST_URL }], album: { name: "Synthetic Album", url: ALBUM_URL } };
/** Every state the component can show. */
const STATES: Record<string, NowPlayingView> = {
  playing: { state: "playing", track: TRACK },
  paused: { state: "paused", track: TRACK },
  "playing, no details": { state: "playing", track: null },
  podcast: { state: "podcast" },
  nothing: { state: "nothing" },
  "not sharing": { state: "not-sharing" },
  unreachable: { state: "unreachable" },
};

function placeholderIds(html: string): string[] {
  return [...html.matchAll(/data-placeholder="([^"]+)"/g)].map((m) => m[1] as string);
}

function gaps(): Record<string, string[]> {
  const now = Date.UTC(2026, 9, 24, 12);
  return Object.fromEntries(
    Object.entries(STATES)
      .map(([k, view]) => [k, placeholderIds(renderToStaticMarkup(<NowPlayingBody view={view} checkedAt={now - 5 * 60_000} servedAt={now} />))] as const)
      .filter(([, ids]) => ids.length > 0),
  );
}

async function privacyHtml(): Promise<string> {
  vi.stubEnv("SITE_MODE", "landing");
  vi.stubEnv("NOW_PLAYING_ENABLED", "true");
  const { default: PrivacyPage } = await import("@/app/privacy/page");
  return renderToStaticMarkup(await PrivacyPage());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("now-playing release gate (N10)", () => {
  it("serves the configured privacy notice with its Spotify sentences whenever the flag is on", async () => {
    const html = await privacyHtml();
    expect(html).toContain(`Version ${privacyNoticeVersion()}`);
    expect(html).toContain("The home page shows what Matthew is playing on Spotify. This site asks Spotify for it. Your browser does not contact Spotify.");
    expect(html).toContain("Track links go to Spotify.");
  });

  it.each([
    { collection: false, publication: false, version: "landing-signal-2" },
    { collection: true, publication: false, version: "landing-signal-4" },
    { collection: false, publication: true, version: "landing-signal-6" },
    { collection: true, publication: true, version: "landing-signal-8" },
  ])("keeps Spotify and the matching Signal disclosures in $version", async ({ collection, publication, version }) => {
    // Render only /privacy: enabling production collection here creates no request producer.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CI", "1");
    vi.stubEnv("VITEST", "");
    vi.stubEnv("PLAYWRIGHT_TEST", "");
    vi.stubEnv("PLAUSIBLE_SITE_ID", "synthetic.example");
    vi.stubEnv("PLAUSIBLE_ENABLED", String(collection));
    vi.stubEnv("PUBLIC_PULSE_ENABLED", String(publication));
    const html = await privacyHtml();
    expect(html).toContain(`Version ${version}`);
    expect(html).toContain("The home page shows what Matthew is playing on Spotify. This site asks Spotify for it. Your browser does not contact Spotify.");
    expect(html).toContain("Track links go to Spotify.");
    expect(html.includes("This site sends cookieless public pageview measurements directly from your browser")).toBe(collection);
    expect(html.includes("Collection of pageviews by Plausible is off in this deployment.")).toBe(!collection);
    expect(html.includes("The Signal publishes selected aggregate pageview counts")).toBe(publication);
  });

  it("finds no outstanding gaps: the official logo replaced the placeholder", () => {
    expect(gaps()).toEqual({});
  });

  it.runIf(NOW_PLAYING_HERE)("with NOW_PLAYING_ENABLED=true, no placeholder renders in any state", () => {
    expect(gaps(), "placeholders in the now-playing component").toEqual({});
  });
});

describe("the release check script", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/check-release.mjs"], { env: { ...process.env, PLAN_ENABLED: "", SITE_MODE: "", NOW_PLAYING_ENABLED: "", NOW_PLAYING_FIXTURE: "", PLAUSIBLE_ENABLED: "", PUBLIC_PULSE_ENABLED: "", ...env }, encoding: "utf8" });

  it("with the flag off does nothing for now playing", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("NOW_PLAYING_ENABLED is not on; nothing to check for now playing.");
  });

  // Runs this file again with the flag on, so not from inside that run.
  for (const publication of ["false", "true"]) {
    it.skipIf(NOW_PLAYING_HERE || process.env.SITE_MODE === "landing")(`passes the landing release with Spotify on and Signal publication ${publication}`, () => {
      const r = run({
        NOW_PLAYING_ENABLED: "true", SITE_MODE: "landing", PUBLIC_PULSE_ENABLED: publication,
        PLAUSIBLE_ENABLED: "true", PLAUSIBLE_SITE_ID: "synthetic.example", VERCEL_ENV: "production", NODE_ENV: "production", CI: "1",
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("release check: landing release: passed.");
      expect(r.stdout).toContain("release check: now playing: passed.");
    }, 240_000);
  }

  it("refuses the test-only synthetic Spotify on Vercel", () => {
    const r = run({ NOW_PLAYING_FIXTURE: "playing", VERCEL: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("NOW_PLAYING_FIXTURE is a test-only synthetic Spotify and must never be set on Vercel");
  });
});
