import { createHash } from "node:crypto";

/** Runtime namespace only. Neither site configuration nor provider responses are persisted in keys. */
export function pulseScope(siteId: string, paths: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([siteId, paths])).digest("hex").slice(0, 32);
}
