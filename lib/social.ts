import type { Metadata } from "next";
import { SHARE_IMAGE_PATH } from "./mode";
import { SITE_NAME, STANDFIRST } from "./site";

/**
 * Social share previews for the landing release (ADR 0010). Every value is
 * Matthew's (25 Oct 2026) or an approved string: the description is the
 * approved standfirst (D1), the image is the committed PNG rendered from the
 * approved lockup (D2, scripts/render-share-image.mjs), and the handle is
 * his (D3). URLs are relative here and made absolute against metadataBase,
 * which is siteUrl(); the canonical host is https://www.vt-infinite.com (D4),
 * set through SITE_URL (docs/ops/social-previews.md).
 */
export const SHARE_DESCRIPTION = STANDFIRST;
export const X_HANDLE = "@MattyJAdams";
export const SHARE_IMAGE = { url: SHARE_IMAGE_PATH, width: 1200, height: 630, type: "image/png", alt: SITE_NAME } as const;

/** Description, canonical link, Open Graph and X card tags for one landing page. `title` is the page's full <title>. */
export function landingShareMetadata(path: "/" | "/privacy", title: string): Metadata {
  return {
    description: SHARE_DESCRIPTION,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, title, description: SHARE_DESCRIPTION, url: path, images: [{ ...SHARE_IMAGE }] },
    twitter: {
      card: "summary_large_image",
      title,
      description: SHARE_DESCRIPTION,
      images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }],
      site: X_HANDLE,
      creator: X_HANDLE,
    },
  };
}
