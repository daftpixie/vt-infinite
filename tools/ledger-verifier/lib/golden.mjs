// Reproduce the golden vectors (PRD MR-37) with this verifier's own
// canonicalization and Merkle code: each event file must already be
// canonical, and its leaves, top, root and every path must match.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCanonicalBytes, parseJsonBytes } from "./json.mjs";
import { checkPath, hex, leafOf, merkleRoot } from "./merkle.mjs";
import { validate } from "./schema.mjs";

const EVENT_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/v1/event.schema.json", import.meta.url), "utf8"));

export function checkGolden(dir) {
  const index = parseJsonBytes(readFileSync(join(dir, "index.json")));
  return index.vectors.map(({ name }) => {
    const problems = [];
    const base = join(dir, name);
    const vector = parseJsonBytes(readFileSync(join(base, "vector.json")));
    const files = readdirSync(join(base, "events")).sort();
    const lines = files.map((f) => readFileSync(join(base, "events", f)));
    lines.forEach((b, k) => {
      if (!isCanonicalBytes(b)) problems.push(`${files[k]} is not canonical`);
      const sp = validate(EVENT_SCHEMA, parseJsonBytes(b));
      if (sp.length) problems.push(`${files[k]}: ${sp[0]}`);
    });
    const leaves = lines.map(leafOf);
    if (leaves.map(hex).join() !== vector.leaves.join()) problems.push("leaf hashes differ");
    const root = hex(merkleRoot(leaves));
    if (root !== vector.root) problems.push(`root ${root} differs from ${vector.root}`);
    if (String(lines.length) !== vector.leafCount) problems.push("leaf count differs");
    vector.paths.forEach((p, k) => {
      if (!checkPath(hex(leaves[k]), k, lines.length, p.path, vector.root)) problems.push(`path ${k} does not reach the root`);
    });
    return { name, ok: problems.length === 0, problems, leafCount: lines.length, root };
  });
}
