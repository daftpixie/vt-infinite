# Landing release cutover

This runbook puts the landing release (`SITE_MODE=landing`, ADRs 0006 to 0008) on vt-infinite.com and www.vt-infinite.com. Matthew runs every step by hand. Nothing here is automated, and no build session runs any of it.

It uses names only. Never paste a token, password, record ID, IP address of the old host or account email into a chat, an issue, a pull request or this repository. Where a value comes from a dashboard, this document says where to read it, not what it is.

Every Cloudflare record in this document is **DNS only (grey cloud)**, never proxied.

## Contents

0. [Before you start](#0-before-you-start)
1. [Pre-flight evidence (A1.5 to A1.7)](#1-pre-flight-evidence-a15-to-a17)
2. [Find the old site's records](#2-find-the-old-sites-records)
3. [Vercel: set the mode and check the deployment on its protected URL](#3-vercel-set-the-mode-and-check-the-deployment)
4. [Rehearsal on next.vt-infinite.com](#4-rehearsal-on-nextvt-infinitecom)
5. [Cutover](#5-cutover)
6. [Post-switch checks](#6-post-switch-checks)
7. [Rollback (under 5 minutes)](#7-rollback-under-5-minutes)
8. [Publication domains: Incentive Eyes and The Human Butterfly](#8-publication-domains)
9. [Unknowns](#9-unknowns)

If any check fails, stop, roll back if the live site is affected, and report it before changing anything else.

## 0. Before you start

- The landing release pull requests are merged into `main`, including stage 5L-2 PR 1 (the privacy notice "landing-1", 404 for `/origin` and `/partners`, indexable `/` and `/privacy`). The checks in section 6 assume them.
- CI is green on `main`, including the step that builds the landing release.
- The Vercel project's plan allows a company site. ADR 0001 records that Vercel describes the Hobby plan as non-commercial, personal use only.
- Pick a quiet time and allow an hour. The switch itself takes minutes; the checks take longer.
- Have open: the Cloudflare dashboard for vt-infinite.com, the Vercel project, and a terminal with `curl` and `dig`.

## 1. Pre-flight evidence (A1.5 to A1.7)

Record each item, with the date, in the private repository's release notes (not here). Do not continue until every item is done.

**Links (A1.5).** Open each link from a production-like deployment (section 3), not from memory or from `content/landing.json`:

- The Human Butterfly: it opens the publication, at its substack.com address until the custom domain is verified (section 8).
- Incentive Eyes: the same.
- The VT Infinite Discord: the invitation opens and has not expired (it is set never to expire).
- The privacy notice link in the footer opens `/privacy`, and its link to Vercel's privacy notice opens.

**Contact address (A1.5).** From an account outside VT Infinite, send a test email to the contact address shown in the footer. Answer it from that address. Record that the reply arrived. Do not change any mail record (MX, SPF, DKIM, DMARC) during this cutover.

**Discord (A1.7).** In the server, before the invitation is public:

- Written community guidelines are posted.
- Matthew is a moderator.
- The minimum age is 13.
- A pinned resources channel carries the crisis-support text exactly as `lib/crisis.ts` holds it (`CRISIS_SUPPORT_TEXT`). Compare it character by character.
- Nothing describes the server as OneRhythm's member platform.

**Privacy notice sources.** Open the three Vercel pages ADR 0008 cites and confirm they still say what its table says. The build session could not open them.

## 2. Find the old site's records

Where the old vt-infinite.com site is hosted today is **not known** to this repository. Do not guess. Look it up:

1. Cloudflare → vt-infinite.com → **DNS** → **Records**.
2. Use **Export** (or take a full screenshot) and keep the file privately. This is the rollback copy (section 7).
3. Note every record whose **Name** is `vt-infinite.com` (shown as `@` or the bare domain) or `www`, of type **A**, **AAAA**, **CNAME** or **ALIAS/flattened CNAME**. These are the records that point at the old site. For each, note its type, content, proxy status and TTL.
   - If the record is proxied (orange cloud), `dig` from outside shows Cloudflare's addresses, not the old host. The dashboard's **Content** column shows the real target.
   - A CNAME target usually names the old host (for example a hosting provider's domain). An A or AAAA record shows only an address; the old provider's dashboard is the place to confirm it.
4. Also note, and **leave alone**: MX, TXT (SPF, DKIM, DMARC, verification), and any record on another name.
5. Note any **CAA** record. If one exists, it must allow the certificate authority Vercel uses before section 5; check Vercel's documentation on custom domains and certificates first.
6. Note any **wildcard** (`*`) record. It must not catch `next`, `incentiveeyes` or another name you add later.
7. Check **Rules** (Page Rules, Redirect Rules) and **SSL/TLS** for anything that applies to vt-infinite.com. Proxied rules stop applying once the records are DNS only; note what they did.

## 3. Vercel: set the mode and check the deployment

Sources: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication, https://vercel.com/docs/cli/curl

1. Vercel → the project → **Settings** → **Environment Variables**.
2. Add `SITE_MODE` = `landing` for **Production** only. Preview stays as it is.
3. Check that **Production** has no feature-flag variable set to `true` (`README.md`, "Feature flags"), and that `VT_TEST_BUILD_WITHOUT_PROXY` is **not** set in any environment. (The build fails if it is.)
4. Leave `SITE_URL` unset or `https://vt-infinite.com`; the sitemap and robots.txt use it.
5. **Deployments** → the latest production deployment → **Redeploy**. Vercel applies the variable to both the build and the runtime.
6. Open the build log. Expect:

   ```
   release check: landing release: checking that no placeholder renders.
   release check: landing release: passed.
   ```

   If it says `FAILED`, stop.
7. Open the deployment's own URL (the `*.vercel.app` address on the deployment page) while signed in to Vercel. With Deployment Protection on, a signed-out browser gets Vercel's sign-in page; that is expected.
8. On the protected URL, check by eye: the mark, "Heart. Mind. Hands." in three columns, the motto, the three links, "Updates sign-up opens soon", and the footer (VT Infinite, Inc., Home, Privacy notice, the contact address). Open `/privacy` and `/words` (404).
9. Or from a terminal, with the Vercel CLI signed in:

   ```sh
   vercel curl / --deployment <deployment-url>
   vercel curl /words --deployment <deployment-url>
   ```

   Expect the landing page HTML from the first, and "Not found" from the second.

No domain is attached yet. vt-infinite.com still shows the old site.

## 4. Rehearsal on next.vt-infinite.com

Source: https://vercel.com/docs/domains/set-up-custom-domain

1. Vercel → the project → **Settings** → **Domains** → **Add** `next.vt-infinite.com`. Connect it to **Production**.
2. Vercel shows the record it needs for this subdomain: a **CNAME**. Copy the value it shows. (Vercel's documentation shows `cname.vercel-dns-0.com` as an example; use the value your project shows.)
3. Cloudflare → DNS → **Add record**: type **CNAME**, name `next`, target as copied, proxy status **DNS only**, TTL **Auto**.
4. Wait until Vercel's domain panel shows the domain as valid and the certificate issued.
5. Run the section 6 checks with `HOST=next.vt-infinite.com`. Skip the `www` and apex DNS checks.
6. Roll it back, as you would for real:
   - Cloudflare: delete the `next` record.
   - Vercel: remove `next.vt-infinite.com` from the project.
   - Time it. Then check that `dig +short next.vt-infinite.com` returns nothing once the TTL has passed.

Do not leave the rehearsal domain attached: it serves the same pages as the real one.

## 5. Cutover

Source for the record types and values: https://vercel.com/docs/domains/set-up-custom-domain (apex: an **A** record, example `76.76.21.21`; subdomain: a **CNAME**, example `cname.vercel-dns-0.com`). Vercel's domain panel shows the exact values for this project; use those, and stop if they differ from what you expect without explanation.

1. Vercel → **Settings** → **Domains**: add `vt-infinite.com`, then `www.vt-infinite.com`. Make `vt-infinite.com` the primary, with `www.vt-infinite.com` redirecting to it. (The sitemap and robots.txt name `https://vt-infinite.com`.)
2. Vercel lists the records each needs. Copy them.
3. Optional, before touching DNS: check that Vercel already serves a certificate for the domain (source: https://vercel.com/docs/domains/pre-generating-ssl-certs):

   ```sh
   curl -sI https://vt-infinite.com --resolve vt-infinite.com:443:<the A record value Vercel showed>
   ```

4. Cloudflare → DNS. For `vt-infinite.com` (apex):
   - **Edit** the existing A record (if there is one) to the value Vercel showed, **DNS only**. Editing in place is quicker to undo than delete and add.
   - **Delete** every other A, **AAAA** and CNAME/ALIAS record on the apex that you noted in section 2. An AAAA record left behind sends IPv6 visitors to the old host.
   - If the apex record is a flattened CNAME to the old host, delete it and add the A record.
5. For `www`:
   - **Edit** the existing CNAME (or replace the A/AAAA records) to the CNAME value Vercel showed, **DNS only**.
6. Do not touch MX, TXT or any other name.
7. Wait until Vercel's domain panel shows both domains as valid. Then run section 6.

## 6. Post-switch checks

Run from a network that is not Cloudflare's or Vercel's. Set the host first:

```sh
HOST=vt-infinite.com
```

**DNS (apex and www only):**

```sh
dig +short vt-infinite.com A        # expect: exactly the A value Vercel showed
dig +short vt-infinite.com AAAA     # expect: nothing
dig +short www.vt-infinite.com CNAME   # expect: the CNAME value Vercel showed
```

**Served by Vercel, not proxied:**

```sh
curl -sI "https://$HOST/" | grep -iE '^(HTTP|server|set-cookie)'
```

Expect `HTTP/2 200` and `server: Vercel`. No `server: cloudflare` line, and no `set-cookie` line.

**www redirects to the apex:**

```sh
curl -sI https://www.vt-infinite.com/ | grep -iE '^(HTTP|location)'
```

Expect a `HTTP/2 30x` status and `location: https://vt-infinite.com/`.

**Every status:**

```sh
for p in / /privacy /robots.txt /sitemap.xml /brand/vt-infinite-mark-small.svg \
         /words /contact /marrs-rover /policies/privacy /fonts/OFL.txt /favicon.ico \
         /origin /partners /phial /api/cron/refresh; do
  printf '%-36s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST$p")"
done
```

Expect:

```
/                                    200
/privacy                             200
/robots.txt                          200
/sitemap.xml                         200
/brand/vt-infinite-mark-small.svg    200
/words                               404
/contact                             404
/marrs-rover                         404
/policies/privacy                    404
/fonts/OFL.txt                       404
/favicon.ico                         404
/origin                              404
/partners                            404
/phial                               410
/api/cron/refresh                    404
```

**robots.txt and the sitemap:**

```sh
curl -s "https://$HOST/robots.txt"
```

Expect exactly:

```
User-agent: *
Allow: /$
Allow: /privacy
Disallow: /

Sitemap: https://vt-infinite.com/sitemap.xml
```

```sh
curl -s "https://$HOST/sitemap.xml" | grep -o '<loc>[^<]*</loc>'
```

Expect `<loc>https://vt-infinite.com</loc>` and `<loc>https://vt-infinite.com/privacy</loc>`, nothing else.

**Indexing:**

```sh
for p in / /privacy /words /phial; do
  printf '%-10s %s\n' "$p" "$(curl -s "https://$HOST$p" | grep -o '<meta name="robots"[^>]*>' | head -1)"
done
```

Expect `content="index, follow"` for `/` and `/privacy`, and `noindex` for `/words` and `/phial`.

**Privacy notice version:**

```sh
curl -s "https://$HOST/privacy" | grep -o 'Version landing-1'
```

Expect `Version landing-1`.

**In a browser:** open `/`, follow each of the three links, the footer's Privacy notice and Home links, and a mistyped address. Switch the theme. Check on a phone that the three columns read across.

## 7. Rollback (under 5 minutes)

Two failure cases. Neither involves unsetting `SITE_MODE`: **unsetting it opens the full site**, which is not released.

**A. The new site is wrong on the domain (DNS or certificate trouble, wrong pages).** Put the old records back:

1. Cloudflare → DNS: edit the apex and `www` records back to the type, content and proxy status in the section 2 export. Re-add any AAAA or other record you deleted.
2. Vercel: leave the domains attached, or remove them; either is fine once DNS points elsewhere.
3. Check: `dig +short vt-infinite.com A` returns the old value (or Cloudflare addresses, if the old record was proxied), and the old site loads. Visitors who looked up the domain recently can see the new site until their resolver's cached answer expires.

**B. A later deployment broke the landing page, and DNS is fine.** Use Vercel's Instant Rollback to the previous production deployment (source: https://vercel.com/docs/deployments/rollback-production-deployment):

- Vercel → **Deployments** → the last good production deployment → **Instant Rollback**, or `vercel rollback <deployment-url>`.
- The Vercel documentation notes that rolling back to an older deployment than the previous one is a Pro or Enterprise feature.

Practise A during the rehearsal (section 4, step 6) and write down how long it took.

## 8. Publication domains

These are separate from the cutover. They can happen before or after it, but each must not conflict with Vercel's own records.

### Incentive Eyes: incentiveeyes.vt-infinite.com

1. Substack → Incentive Eyes → **Settings** → **Domain** → add the custom domain `incentiveeyes.vt-infinite.com`. Substack shows the CNAME target to use. Use exactly that value. (Older third-party guides give other targets; do not use them.) Substack's help centre covers the steps and any fee; check it there.
2. Cloudflare → vt-infinite.com → DNS → **Add record**: type **CNAME**, name `incentiveeyes`, target as Substack showed, **DNS only**. Substack's guidance for Cloudflare is that this record must not be proxied.
3. No conflict with Vercel: Vercel needs only the apex A record and the `www` CNAME. Check that no wildcard (`*`) record exists (section 2).
4. Wait for Substack to show the domain as verified.

### The Human Butterfly: www.thehumanbutterfly.dev

thehumanbutterfly.dev was bought through Vercel, so its DNS is managed in **Vercel DNS**, not Cloudflare.

1. Substack → The Human Butterfly → **Settings** → **Domain** → add `www.thehumanbutterfly.dev`. Copy the CNAME target Substack shows.
2. Vercel → **Domains** (the account's domain list, not the project) → thehumanbutterfly.dev → **DNS Records**. List every record first. Look for an existing `www` record, a wildcard `*`, or an ALIAS on the apex, and note which project, if any, the domain is assigned to.
3. A name can carry only one CNAME. If any project in Vercel has `www.thehumanbutterfly.dev` attached, remove it from that project first, or Vercel's own record will conflict with Substack's.
4. Add a record: type **CNAME**, name `www`, value as Substack showed.
5. The amendment states that the bare domain redirects to `www`. Check it rather than set it:

   ```sh
   curl -sI https://thehumanbutterfly.dev/ | grep -iE '^(HTTP|location)'
   ```

   Expect a redirect to `https://www.thehumanbutterfly.dev/`. If it does not redirect, stop and decide how it should before changing anything: this document does not choose for you.
6. Wait for Substack to show the domain as verified.

### Switch the landing links (one line each)

Once Substack verifies a custom domain, and the custom domain opens the publication over https, change that publication's `href` in `content/landing.json` to its `customDomain` value, in a pull request:

```diff
-    { "label": "Incentive Eyes", "href": "https://incentiveeyes.substack.com", "customDomain": "https://incentiveeyes.vt-infinite.com" },
+    { "label": "Incentive Eyes", "href": "https://incentiveeyes.vt-infinite.com", "customDomain": "https://incentiveeyes.vt-infinite.com" },
```

```diff
-    { "label": "The Human Butterfly", "href": "https://everydecimal.substack.com", "customDomain": "https://www.thehumanbutterfly.dev" },
+    { "label": "The Human Butterfly", "href": "https://www.thehumanbutterfly.dev", "customDomain": "https://www.thehumanbutterfly.dev" },
```

The unit test `tests/unit/landing.test.ts` pins the current links, so the same pull request updates its expected `href`. CI checks the rest. After it deploys, open the link from the live page.

## 9. Unknowns

- **Where the old site is hosted.** Not recorded here. Section 2 says how to find it in Cloudflare.
- **Exact DNS values.** This document cites Vercel's examples. The values Vercel's domain panel shows for this project are the ones to use.
- **Substack's CNAME target.** Use the value Substack's dashboard shows.
- **How thehumanbutterfly.dev redirects to www today.** Check it (section 8); do not change it as part of this cutover.
- **Cloudflare TTL.** Rollback time depends on the TTL of the records you change. The section 2 export shows it.
