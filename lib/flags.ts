/**
 * Server-side feature flags. Every flag is off unless its environment
 * variable is exactly the string "true". Unset, empty, "TRUE", "1" and
 * anything else mean off. Flags are read per request on the server and
 * never shipped to the browser.
 */
export const FLAGS = {
  governanceDemo: "GOVERNANCE_DEMO_ENABLED",
  governanceLive: "GOVERNANCE_LIVE_ENABLED",
  plan: "PLAN_ENABLED",
  comments: "COMMENTS_ENABLED",
  playlist: "PLAYLIST_ENABLED",
  marrsRoverRealData: "MARRS_ROVER_REAL_DATA_ENABLED",
} as const;

export type Flag = keyof typeof FLAGS;

export type Env = Readonly<Record<string, string | undefined>>;

export function isEnabled(flag: Flag, env: Env = process.env): boolean {
  return env[FLAGS[flag]] === "true";
}

/** The synthetic Marrs Rover entity. Real entities never use this ID. */
export const DEMO_ENTITY_ID = "demo";
