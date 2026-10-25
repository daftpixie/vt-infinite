# Social share previews: canonical host, check, re-scrape

`/` and `/privacy` carry a description, a canonical link, Open Graph tags and X card tags, with a share image at `/brand/vt-infinite-share.png` (ADR 0010). This guide names variables only. Matthew runs every step.

## 1. Canonical host

Every absolute URL in the tags is built from `siteUrl()`. It defaults to `https://www.vt-infinite.com`, the host production redirects the apex to (Matthew, 25 Oct 2026), so nothing needs setting. `SITE_URL` overrides the default.

1. In Vercel → the project → **Settings** → **Environment Variables**, check `SITE_URL` in **Production**:
   - unset: nothing to do;
   - `https://www.vt-infinite.com`: nothing to do;
   - `https://vt-infinite.com` (the cutover runbook allowed it): delete it, or change it to `https://www.vt-infinite.com`, then **Redeploy** Production.
2. After the deploy that carries ADR 0010, check:

   ```sh
   curl -s https://www.vt-infinite.com/ | grep -oE '<(link rel="canonical"|meta (property|name)="(og|twitter):(url|image)")[^>]*>'
   curl -s https://www.vt-infinite.com/robots.txt | grep Sitemap
   ```

   Expect:
   - `https://www.vt-infinite.com` in the canonical link and `og:url`;
   - `https://www.vt-infinite.com/brand/vt-infinite-share.png` in `og:image` and `twitter:image`;
   - `Sitemap: https://www.vt-infinite.com/sitemap.xml`.

The same host also names, on the landing release, every `<loc>` in `/sitemap.xml`: `https://www.vt-infinite.com` and `https://www.vt-infinite.com/privacy`. On the full site, still off, it also names the feed links, the essays' fallback canonical links and the download commands on the Marrs Rover verify page. Nothing else reads it.

## 2. Check the previews after a deploy

- **LinkedIn:** Post Inspector, https://www.linkedin.com/post-inspector/ — enter `https://www.vt-infinite.com/`.
- **Facebook:** Sharing Debugger, https://developers.facebook.com/tools/debug/ — enter the URL, then **Scrape Again**.
- **Any platform, as a preview:** https://www.opengraph.xyz/ — enter the URL.
- **X** has no public card validator. Paste the URL into a new post and look at the card before posting, or send it in a direct message to yourself; delete it afterwards if you posted.

Each should show the title "VT Infinite", the standfirst as the description, and the share image: the stacked mark, white on black, with "ad astra per aspera" below. `/privacy` shows "Privacy notice · VT ∞".

## 3. After changing the tags or the image

Platforms cache a preview for days. After a change is live:

- **Facebook:** Sharing Debugger → **Scrape Again**, for `/` and `/privacy`.
- **LinkedIn:** Post Inspector re-reads the page when you inspect it.
- **X:** there is no re-scrape tool; its cached card refreshes on its own, after a delay X does not publish.

If the image itself changes, give it a new file name (for example `vt-infinite-share-2.png`) in the same pull request, so caches that key on the image URL fetch the new one. ADR 0010, "Updating the image", has the steps.
