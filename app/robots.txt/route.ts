import { connection } from "next/server";
import { isLanding, LANDING_PAGES } from "@/lib/mode";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt exists only in landing mode, where it lists the landing
 * release's public pages and nothing else. The full build has none, as
 * before; its pages carry noindex until cutover.
 */
export async function GET() {
  await connection();
  if (!isLanding()) return new Response(null, { status: 404 });
  const base = siteUrl();
  const allow = LANDING_PAGES.map((p) => `Allow: ${p === "/" ? "/$" : p}`);
  const body = ["User-agent: *", ...allow, "Disallow: /", "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
