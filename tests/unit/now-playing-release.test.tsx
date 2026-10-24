import { spawnSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NowPlayingBody } from "@/components/now-playing/NowPlayingBody";
import type { NowPlayingView } from "@/lib/now-playing/projection";
import { ALBUM_URL, ARTIST_URL, TRACK_URL } from "./now-playing-synthetic";

/**
 * Now-playing release gate (ADR 0009, N10). With NOW_PLAYING_ENABLED=true
 * the build runs this file first (scripts/check-release.mjs, `prebuild`) and
 * fails unless:
 *
 * - /privacy serves notice "landing-2", with its Spotify sentences, and
 * - no placeholder renders in the component, in any state.
 *
 * CI runs with the flag off and checks that the gate sees what it must:
 * today the Spotify logo is still a placeholder, so a flag-on build fails.
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
  it("serves landing-2, with its Spotify sentences, whenever the flag is on", async () => {
    const html = await privacyHtml();
    expect(html).toContain("Version landing-2");
    expect(html).toContain("The home page shows what Matthew is playing on Spotify. This site asks Spotify for it. Your browser does not contact Spotify.");
    expect(html).toContain("Track links go to Spotify.");
  });

  it("sees a placeholder in the states that show Spotify's metadata: the logo is not supplied yet", () => {
    expect(gaps()).toEqual({ playing: ["spotifyLogo"], paused: ["spotifyLogo"] });
  });

  it.runIf(NOW_PLAYING_HERE)("with NOW_PLAYING_ENABLED=true, no placeholder renders in any state", () => {
    expect(gaps(), "placeholders in the now-playing component").toEqual({});
  });
});

describe("the release check script", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/check-release.mjs"], { env: { ...process.env, PLAN_ENABLED: "", SITE_MODE: "", NOW_PLAYING_ENABLED: "", NOW_PLAYING_FIXTURE: "", ...env }, encoding: "utf8" });

  it("with the flag off does nothing for now playing", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("NOW_PLAYING_ENABLED is not on; nothing to check for now playing.");
  });

  // Runs this file again with the flag on, so not from inside that run.
  it.skipIf(NOW_PLAYING_HERE)("with NOW_PLAYING_ENABLED=true refuses the build while the logo is a placeholder", () => {
    const r = run({ NOW_PLAYING_ENABLED: "true" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("release check: now playing: FAILED.");
  }, 120_000);

  it("refuses the test-only synthetic Spotify on Vercel", () => {
    const r = run({ NOW_PLAYING_FIXTURE: "playing", VERCEL: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("NOW_PLAYING_FIXTURE is a test-only synthetic Spotify and must never be set on Vercel");
  });
});
