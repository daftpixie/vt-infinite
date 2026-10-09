import { VERIFIER_ARCHIVE_NAME, verifierArchive } from "@/lib/marrs-rover/verifier-archive";
import { landingNotFound } from "@/lib/mode-gate";

/**
 * The standalone verifier as a reproducible archive, at a fixed path
 * (decision D1, 7 Oct 2026). Its SHA-256 and size are shown on the Verify
 * page, so a reader can check the file before running it.
 */
export async function GET() {
  const landing = landingNotFound();
  if (landing) return landing;
  const { bytes } = verifierArchive();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="${VERIFIER_ARCHIVE_NAME}"`,
      // The bytes change whenever the verifier changes, so the path is not cached for long.
      "Cache-Control": "public, max-age=300",
    },
  });
}
