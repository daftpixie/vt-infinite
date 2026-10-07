// Merkle "marrs-rover-merkle.1", implemented for the verifier alone.
//
//   leaf   = SHA256(0x00 || canonical event bytes)
//   parent = SHA256(0x01 || left || right)
//   root   = SHA256(0x02 || leaf count as 8-byte big-endian || top)
//
// An odd final node at any level is promoted unchanged, never duplicated.
import { createHash } from "node:crypto";

export const ALGORITHM = "marrs-rover-merkle.1";

export const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const x of parts) h.update(x);
  return h.digest();
};
export const hex = (b) => Buffer.from(b).toString("hex");

export const leafOf = (bytes) => sha256(Buffer.from([0x00]), bytes);
const nodeOf = (l, r) => sha256(Buffer.from([0x01]), l, r);

export function rootOf(top, count) {
  const n = Buffer.alloc(8);
  n.writeBigUInt64BE(BigInt(count));
  return sha256(Buffer.from([0x02]), n, top);
}

/** Root over leaf digests (Buffers), in order. */
export function merkleRoot(leaves) {
  if (leaves.length === 0) throw new RangeError("no leaves");
  let level = leaves;
  while (level.length > 1) {
    const up = [];
    for (let k = 0; k + 1 < level.length; k += 2) up.push(nodeOf(level[k], level[k + 1]));
    if (level.length % 2 === 1) up.push(level[level.length - 1]);
    level = up;
  }
  return rootOf(level[0], leaves.length);
}

/** Which side each sibling must be on, from the leaf up, for position `index` of `count`. */
export function pathShape(index, count) {
  const sides = [];
  for (let k = index, n = count; n > 1; k = k >> 1, n = (n + 1) >> 1) {
    const promoted = n % 2 === 1 && k === n - 1;
    if (!promoted) sides.push(k % 2 === 0 ? "right" : "left");
  }
  return sides;
}

/** Fold a leaf up its path. The path must have exactly the shape its position implies. */
export function checkPath(leafHex, index, count, path, rootHex) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 0 || index >= count) return false;
  const shape = pathShape(index, count);
  if (!Array.isArray(path) || path.length !== shape.length) return false;
  let acc = Buffer.from(leafHex, "hex");
  for (let k = 0; k < path.length; k++) {
    const step = path[k];
    if (step.side !== shape[k] || !/^[0-9a-f]{64}$/.test(step.hash)) return false;
    const sib = Buffer.from(step.hash, "hex");
    acc = step.side === "left" ? nodeOf(sib, acc) : nodeOf(acc, sib);
  }
  return hex(rootOf(acc, count)) === rootHex;
}
