import { runRules } from "@/guards/rules.mjs";

/** Rules that keep a piece off Home, where institutional claims apply (SS-9). */
export const HOME_RULES = ["pbc-mention", "funding-ask", "clinical-function", "initiative-pairing"];

/** True when text shown on Home passes the homepage claim checks. Streams and local essays both use this. */
export function passesHomeChecks(text: string, target: string, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return runRules(text, { target, scopes: ["copy"], env, only: HOME_RULES }).length === 0;
}
