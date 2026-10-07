import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bindRoot, buildTree, expectedSides, fromHex, inclusionPath, leafHash, levels, parentHash, toHex, verifyInclusion } from "@/packages/ledger-proof/src/merkle.ts";
import * as vm from "@/tools/ledger-verifier/lib/merkle.mjs";

const enc = new TextEncoder();
const items = (n: number) => Array.from({ length: n }, (_, k) => enc.encode(`{"synthetic":"leaf ${k}"}`));
const sha = (...parts: Uint8Array[]) => {
  const h = createHash("sha256");
  parts.forEach((p) => h.update(p));
  return new Uint8Array(h.digest());
};

describe("construction (MR-33)", () => {
  it("leaf = SHA256(0x00 || bytes); parent = SHA256(0x01 || left || right) over raw digests", () => {
    const [a, b] = items(2) as [Uint8Array, Uint8Array];
    expect(toHex(leafHash(a))).toBe(toHex(sha(Uint8Array.of(0), a)));
    const la = leafHash(a);
    const lb = leafHash(b);
    expect(toHex(parentHash(la, lb))).toBe(toHex(sha(Uint8Array.of(1), la, lb)));
    // Not hex text: the hex digest string is never what is hashed.
    expect(toHex(parentHash(la, lb))).not.toBe(toHex(sha(Uint8Array.of(1), enc.encode(toHex(la) + toHex(lb)))));
  });

  it("binds the leaf count into the root: SHA256(0x02 || uint64be(count) || top)", () => {
    const t = buildTree(items(3));
    const count = new Uint8Array(8);
    count[7] = 3;
    expect(t.root).toBe(toHex(sha(Uint8Array.of(2), count, fromHex(t.top))));
    // The same top with a different count gives a different root.
    expect(toHex(bindRoot(fromHex(t.top), 4))).not.toBe(t.root);
  });

  it("a single leaf's root is not the leaf itself", () => {
    const t = buildTree(items(1));
    expect(t.top).toBe(t.leaves[0]);
    expect(t.root).not.toBe(t.top);
  });

  it("promotes an odd final node unchanged and never duplicates it", () => {
    const three = items(3);
    const lv = levels(three.map(leafHash));
    expect(lv.map((l) => l.length)).toEqual([3, 2, 1]);
    expect(toHex(lv[1]?.[1] as Uint8Array)).toBe(toHex(leafHash(three[2] as Uint8Array)));
    // Duplicating the last item (the classic Bitcoin-style rule) gives a different root.
    const dup = buildTree([...three, three[2] as Uint8Array]);
    expect(dup.root).not.toBe(buildTree(three).root);
    expect(dup.top).not.toBe(buildTree(three).top);
  });

  it("refuses an empty tree: a period always has at least one event", () => {
    expect(() => buildTree([])).toThrow(/at least one leaf/);
    expect(() => vm.merkleRoot([])).toThrow();
  });

  it("the verifier's independent implementation gives the same root for 1 to 33 leaves", () => {
    for (let n = 1; n <= 33; n++) {
      const its = items(n);
      expect(vm.hex(vm.merkleRoot(its.map(vm.leafOf))), `n=${n}`).toBe(buildTree(its).root);
    }
  });

  it("a root above 2^32 leaves is still well defined (count encoding)", () => {
    const top = leafHash(enc.encode("x"));
    expect(toHex(bindRoot(top, 2 ** 40))).toBe(vm.hex(vm.rootOf(Buffer.from(top), 2 ** 40)));
  });
});

describe("inclusion proofs (MR-33)", () => {
  it("every position of every size from 1 to 33 verifies in both implementations", () => {
    for (let n = 1; n <= 33; n++) {
      const its = items(n);
      const t = buildTree(its);
      for (let i = 0; i < n; i++) {
        const path = inclusionPath(its, i);
        expect(path.map((s) => s.side)).toEqual(expectedSides(i, n));
        expect(vm.pathShape(i, n)).toEqual(expectedSides(i, n));
        expect(verifyInclusion(t.leaves[i] as string, i, n, path, t.root), `n=${n} i=${i}`).toBe(true);
        expect(vm.checkPath(t.leaves[i], i, n, path, t.root)).toBe(true);
      }
    }
  });

  it("the last leaf of an odd level skips that level", () => {
    // 5 leaves: leaf 4 is promoted twice, then pairs with the top of leaves 0-3.
    expect(expectedSides(4, 5)).toEqual(["left"]);
    expect(expectedSides(0, 5)).toEqual(["right", "right", "right"]);
  });

  it("rejects a proof for the wrong position, a flipped side, a dropped or extra step, another leaf, or the wrong count", () => {
    const its = items(7);
    const t = buildTree(its);
    const path = inclusionPath(its, 2);
    const leaf = t.leaves[2] as string;
    const cases: [string, () => boolean, () => boolean][] = [
      ["wrong index", () => verifyInclusion(leaf, 3, 7, path, t.root), () => vm.checkPath(leaf, 3, 7, path, t.root)],
      ["flipped side", () => verifyInclusion(leaf, 2, 7, [{ ...path[0]!, side: "left" }, ...path.slice(1)], t.root), () => vm.checkPath(leaf, 2, 7, [{ ...path[0], side: "left" }, ...path.slice(1)], t.root)],
      ["dropped step", () => verifyInclusion(leaf, 2, 7, path.slice(1), t.root), () => vm.checkPath(leaf, 2, 7, path.slice(1), t.root)],
      ["extra step", () => verifyInclusion(leaf, 2, 7, [...path, path[0]!], t.root), () => vm.checkPath(leaf, 2, 7, [...path, path[0]], t.root)],
      ["other leaf", () => verifyInclusion(t.leaves[3] as string, 2, 7, path, t.root), () => vm.checkPath(t.leaves[3], 2, 7, path, t.root)],
      ["wrong count", () => verifyInclusion(leaf, 2, 8, path, t.root), () => vm.checkPath(leaf, 2, 8, path, t.root)],
      ["index out of range", () => verifyInclusion(leaf, 7, 7, path, t.root), () => vm.checkPath(leaf, 7, 7, path, t.root)],
      ["malformed hash", () => verifyInclusion(leaf, 2, 7, [{ side: path[0]!.side, hash: "zz" }, ...path.slice(1)], t.root), () => vm.checkPath(leaf, 2, 7, [{ side: path[0]!.side, hash: "zz" }, ...path.slice(1)], t.root)],
    ];
    for (const [name, lib, ver] of cases) {
      expect(lib(), name).toBe(false);
      expect(ver(), name).toBe(false);
    }
  });
});
