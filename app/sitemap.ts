import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { publishedEssays } from "@/lib/content/essays";
import { publishedRecord } from "@/lib/content/record";
import { isLanding, LANDING_PAGES } from "@/lib/mode";
import { PAGES_200 } from "@/lib/routes";
import { siteUrl } from "@/lib/site";

/** Public routes plus published local content only (PRD W-6). Drafts and held pieces never appear. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteUrl();
  // The landing release lists its own pages and nothing else.
  if (isLanding()) return LANDING_PAGES.map((p) => ({ url: `${base}${p === "/" ? "" : p}` }));
  return [
    ...PAGES_200.map((p) => ({ url: `${base}${p === "/" ? "" : p}` })),
    ...publishedEssays().map((e) => ({ url: `${base}/words/${e.slug}`, lastModified: e.updatedAt })),
    ...publishedRecord().map((e) => ({ url: `${base}/the-record/${e.slug}`, lastModified: e.updatedAt })),
  ];
}
