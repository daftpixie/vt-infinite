import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { essayAssetPath } from "@/lib/content/essays";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};

/** Serves only the cover and PDF a published essay names (PRD W-5). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const path = essayAssetPath(slug, file);
  const type = TYPES[extname(file).toLowerCase()];
  if (!path || !type) return new Response(null, { status: 404 });
  const body = await readFile(path);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" } });
}
