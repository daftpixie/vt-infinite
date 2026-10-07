import { createHash } from "node:crypto";

/**
 * Merkle construction "marrs-rover-merkle.1" (PRD MR-33, ADR 0005).
 *
 *   leaf   = SHA256(0x00 || canonicalEventBytes)
 *   parent = SHA256(0x01 || left || right)        raw 32-byte digests
 *   root   = SHA256(0x02 || uint64be(leafCount) || top)
 *
 * Leaves are in event-sequence order. When a level has an odd number of
 * nodes, the last one is promoted unchanged to the next level; it is never
 * duplicated, so no two different leaf lists share a top. The published
 * root binds the leaf count under its own domain byte (0x02), so a tree and
 * a truncated or padded copy of it can never share a root, and a root can
 * never be mistaken for a leaf or an inner node. A tree has at least one
 * leaf: a period with no cash activity still carries a reconciliation or
 * scope event (MR-33), and an empty tree has no root.
 */
export const MERKLE_ALGORITHM = "marrs-rover-merkle.1";
const LEAF = 0x00;
const NODE = 0x01;
const ROOT = 0x02;

export type Side = "left" | "right";
export type PathStep = { side: Side; hash: string };

const sha256 = (...parts: Uint8Array[]): Uint8Array => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
};

export const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
export const fromHex = (s: string): Uint8Array => {
  if (!/^[0-9a-f]{64}$/.test(s)) throw new TypeError("expected a 32-byte lowercase hex digest");
  return new Uint8Array(Buffer.from(s, "hex"));
};

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

export function leafHash(canonicalEventBytes: Uint8Array): Uint8Array {
  return sha256(Uint8Array.of(LEAF), canonicalEventBytes);
}

export function parentHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(Uint8Array.of(NODE), left, right);
}

function countBytes(count: number): Uint8Array {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError("a tree has at least one leaf");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(count));
  return b;
}

/** The published root: the top of the tree bound to the leaf count. */
export function bindRoot(top: Uint8Array, leafCount: number): Uint8Array {
  return sha256(Uint8Array.of(ROOT), countBytes(leafCount), top);
}

/** Every level of the tree, leaves first. */
export function levels(leaves: Uint8Array[]): Uint8Array[][] {
  if (leaves.length === 0) throw new RangeError("a tree has at least one leaf");
  const out: Uint8Array[][] = [leaves];
  while ((out.at(-1) as Uint8Array[]).length > 1) {
    const level = out.at(-1) as Uint8Array[];
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      // Odd final node: promoted unchanged, never duplicated.
      next.push(i + 1 < level.length ? parentHash(level[i] as Uint8Array, level[i + 1] as Uint8Array) : (level[i] as Uint8Array));
    }
    out.push(next);
  }
  return out;
}

export type Tree = { leafCount: number; leaves: string[]; top: string; root: string };

/** Build the tree over canonical event bytes, already in sequence order. */
export function buildTree(eventBytes: Uint8Array[]): Tree {
  const leaves = eventBytes.map(leafHash);
  const lv = levels(leaves);
  const top = (lv.at(-1) as Uint8Array[])[0] as Uint8Array;
  return { leafCount: leaves.length, leaves: leaves.map(toHex), top: toHex(top), root: toHex(bindRoot(top, leaves.length)) };
}

/**
 * The sides a valid path must have, from the leaf up, for leaf `index` of
 * `count`. A level where the node is promoted contributes no step.
 */
export function expectedSides(index: number, count: number): Side[] {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 0 || index >= count) throw new RangeError("leaf index out of range");
  const sides: Side[] = [];
  let i = index;
  let n = count;
  while (n > 1) {
    const promoted = i === n - 1 && n % 2 === 1;
    if (!promoted) sides.push(i % 2 === 0 ? "right" : "left");
    i = Math.floor(i / 2);
    n = Math.ceil(n / 2);
  }
  return sides;
}

/** The inclusion path for leaf `index`: each sibling and which side it sits on. */
export function inclusionPath(eventBytes: Uint8Array[], index: number): PathStep[] {
  const lv = levels(eventBytes.map(leafHash));
  const path: PathStep[] = [];
  let i = index;
  for (const level of lv.slice(0, -1)) {
    const promoted = i === level.length - 1 && level.length % 2 === 1;
    if (!promoted) {
      const sibling = i % 2 === 0 ? i + 1 : i - 1;
      path.push({ side: i % 2 === 0 ? "right" : "left", hash: toHex(level[sibling] as Uint8Array) });
    }
    i = Math.floor(i / 2);
  }
  return path;
}

/**
 * Check that `leaf` (a leaf digest, hex) at `index` of a `count`-leaf tree
 * reaches `root` along `path`. The path's shape must be exactly the one the
 * position implies, so a proof for one position cannot pass for another.
 */
export function verifyInclusion(leaf: string, index: number, count: number, path: PathStep[], root: string): boolean {
  let sides: Side[];
  try {
    sides = expectedSides(index, count);
  } catch {
    return false;
  }
  if (path.length !== sides.length || path.some((s, k) => s.side !== sides[k])) return false;
  let acc: Uint8Array;
  try {
    acc = fromHex(leaf);
    for (const step of path) {
      const sib = fromHex(step.hash);
      acc = step.side === "left" ? parentHash(sib, acc) : parentHash(acc, sib);
    }
  } catch {
    return false;
  }
  return toHex(bindRoot(acc, count)) === root;
}
