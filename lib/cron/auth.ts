import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs). Both sides are
 * hashed to a fixed length first, so the comparison is constant-time and
 * leaks neither the secret nor its length. No secret configured means no
 * request is authorized.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
