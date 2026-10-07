import { createHmac, randomBytes } from "node:crypto";

/**
 * Stable public keys (PRD A-5). A public key is random, so nothing about a
 * provider ID can be read from it. To keep it stable across reads, the
 * server remembers which key it gave each item, indexed by a keyed digest
 * (HMAC-SHA-256 with PLAN_KEY_SECRET) of the provider ID: the raw ID is
 * never stored, and the index is never served.
 */
export type KeyIndex = Record<string, string>;

export function keyIndexDigest(gid: string, secret: string): string {
  return createHmac("sha256", secret).update(`asana-task\n${gid}`).digest("hex");
}

export function newPublicKey(): string {
  return `s${randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "0")}`;
}

/** A key allocator over a prior index. `index()` returns only the entries used in this read. */
export function keyAllocator(prior: KeyIndex, secret: string, make: () => string = newPublicKey) {
  const used: KeyIndex = {};
  const taken = new Set(Object.values(prior));
  return {
    keyFor(gid: string): string {
      const d = keyIndexDigest(gid, secret);
      const existing = used[d] ?? prior[d];
      if (existing) return (used[d] = existing);
      let k = make();
      while (taken.has(k)) k = make();
      taken.add(k);
      return (used[d] = k);
    },
    index: () => used,
  };
}
