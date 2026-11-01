import { resolve } from "node:path";
import { FileSnapshotStore } from "@/lib/storage/file";
import { aggregatePaths } from "@/lib/pulse/public-paths";
import { pulseScope } from "@/lib/pulse/keys";
import { syntheticPulse } from "./pulse-synthetic";

/** Seed only the local test store. The production app has no fixture or demo adapter. */
export default async function setup() {
  process.env.ESSAYS_DIR = "tests/fixtures/essays";
  process.env.RECORD_DIR = "tests/fixtures/record";
  process.env.ALLOW_CONTENT_FIXTURES = "true";
  const scope = pulseScope("synthetic.example", aggregatePaths({}));
  const store = new FileSnapshotStore(resolve(".data/pulse-e2e"));
  const data = syntheticPulse();
  for (const kind of ["recent", "history"] as const) {
    const value = data[kind].data!;
    await store.put(`pulse:v1:${scope}:${kind}`, { schemaVersion: 1, fetchedAt: value.readAt, data: value });
  }
}
