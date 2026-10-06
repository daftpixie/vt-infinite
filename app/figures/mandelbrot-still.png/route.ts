import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isEnabled } from "@/lib/flags";
import { MANDELBROT, renderFrame } from "@/lib/figures/mandelbrot";
import { maskToPng } from "@/lib/figures/png";

const WIDTH = 600;
const HEIGHT = 400;
let cached: Buffer | null = null;

/** The no-JavaScript still for the Mandelbrot figure. Held behind its flag (P7). */
export async function GET() {
  await connection();
  if (!isEnabled("mandelbrot")) notFound();
  cached ??= maskToPng(renderFrame(WIDTH, HEIGHT, MANDELBROT.start), WIDTH, HEIGHT);
  return new Response(new Uint8Array(cached), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
