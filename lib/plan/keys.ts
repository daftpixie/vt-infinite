import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Stable public keys (PRD A-5). A public key is random, so nothing about a
 * provider ID can be read from it. To keep it stable across reads, the
 * server remembers which key it gave each item, indexed by a keyed digest
 * (HMAC-SHA-256 with PLAN_KEY_SECRET) of the provider ID: the raw ID is
 * never stored, and the index is never served.
 *
 * The index keeps every key it has issued, not only the keys in the latest
 * read, so an item that is held back by a guard or briefly missing from a
 * read gets its old key when it returns. Growth is bounded: the index holds
 * every item in the current read plus, up to MAX_KEY_INDEX_ENTRIES in all,
 * the items not in it, most recently seen first. Only an item unseen while
 * that many others were seen more recently loses its key.
 *
 * Rotating PLAN_KEY_SECRET changes every digest, so every item gets a new
 * key. The index records a check value derived from the secret; when it no
 * longer matches, the old entries (which could never match again) are
 * dropped rather than kept as dead weight.
 */
export const KEY_INDEX_VERSION = 2;
export const MAX_KEY_INDEX_ENTRIES = 5_000;

const KeyIndexSchema = z.object({
  version: z.literal(KEY_INDEX_VERSION),
  check: z.string().regex(/^[0-9a-f]{64}$/),
  entries: z.record(
    z.string().regex(/^[0-9a-f]{64}$/),
    z.object({ key: z.string().regex(/^s[A-Za-z0-9]{12}$/), seen: z.iso.datetime() }),
  ),
});
export type KeyIndex = z.infer<typeof KeyIndexSchema>;

export function keyIndexDigest(gid: string, secret: string): string {
  return createHmac("sha256", secret).update(`asana-task\n${gid}`).digest("hex");
}

/** Identifies the secret an index was built with, without revealing it. */
export function keyIndexCheck(secret: string): string {
  return createHmac("sha256", secret).update("plan-key-index-check").digest("hex");
}

export function newPublicKey(): string {
  return `s${randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "0")}`;
}

/** Why the prior index was not used: `rotated` after a secret change, `unreadable` for any other shape. */
export type PriorIndexState = "used" | "empty" | "rotated" | "unreadable";

type AllocatorOptions = { now: Date; make?: () => string; max?: number };

/**
 * A key allocator over a prior index (whatever was stored, or nothing).
 * `index()` returns the index to store after this read.
 */
export function keyAllocator(prior: unknown, secret: string, opts: AllocatorOptions) {
  const make = opts.make ?? newPublicKey;
  const max = opts.max ?? MAX_KEY_INDEX_ENTRIES;
  const check = keyIndexCheck(secret);
  const seen = opts.now.toISOString();

  let priorState: PriorIndexState = "empty";
  let entries: KeyIndex["entries"] = {};
  if (prior !== null && prior !== undefined) {
    const parsed = KeyIndexSchema.safeParse(prior);
    if (!parsed.success) priorState = "unreadable";
    else if (parsed.data.check !== check) priorState = "rotated";
    else {
      priorState = "used";
      entries = parsed.data.entries;
    }
  }

  const used: KeyIndex["entries"] = {};
  const taken = new Set(Object.values(entries).map((e) => e.key));
  return {
    priorState,
    keyFor(gid: string): string {
      const d = keyIndexDigest(gid, secret);
      const existing = used[d]?.key ?? entries[d]?.key;
      if (existing) {
        used[d] = { key: existing, seen };
        return existing;
      }
      let k = make();
      while (taken.has(k)) k = make();
      taken.add(k);
      used[d] = { key: k, seen };
      return k;
    },
    index(): KeyIndex {
      const retired = Object.entries(entries)
        .filter(([d]) => !(d in used))
        .sort(([, a], [, b]) => (a.seen < b.seen ? 1 : a.seen > b.seen ? -1 : 0))
        .slice(0, Math.max(0, max - Object.keys(used).length));
      return { version: KEY_INDEX_VERSION, check, entries: { ...Object.fromEntries(retired), ...used } };
    },
  };
}
