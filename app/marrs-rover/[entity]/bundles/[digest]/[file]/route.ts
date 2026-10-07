import { DEMO_ENTITY_ID, isEnabled } from "@/lib/flags";
import { bundleFileBytes, isDigest, listBundles } from "@/lib/marrs-rover/bundles";

/** Text types only; every file in a bundle is UTF-8 text. */
const TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  jsonl: "application/x-ndjson; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

/**
 * One file of a sealed bundle, at its content-addressed location
 * (PRD MR-30, MR-31): /marrs-rover/<entity>/bundles/<manifest SHA-256>/<file>.
 * Only a file the manifest lists, of a bundle that passes every check, is
 * served, and its bytes are checked against the manifest on every read.
 * The bytes are never altered, so each file keeps the demo label it was
 * sealed with.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ entity: string; digest: string; file: string }> }) {
  const { entity, digest, file } = await params;
  if (entity !== DEMO_ENTITY_ID && !isEnabled("marrsRoverRealData")) return new Response(null, { status: 404 });
  if (!isDigest(digest)) return new Response(null, { status: 404 });
  const ref = listBundles().find((r) => r.entityId === entity && r.digest === digest);
  const type = TYPES[file.split(".").pop() ?? ""];
  if (!ref || !type) return new Response(null, { status: 404 });
  const bytes = bundleFileBytes(ref, file);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${file}"`,
      // The address is the manifest's digest, so the content at it never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
