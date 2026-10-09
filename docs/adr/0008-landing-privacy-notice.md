# ADR 0008: Landing privacy notice ("landing-1")

- Status: proposed (stage 5L-2, pull request 1)
- Date: 2026-10-09
- Decider: Matthew J Adams

## Context

The landing release goes live before the email list (Matthew, 9 October 2026). Its privacy notice has to describe what the landing release actually does, which is collect nothing, in plain language. The email list will bring a new version ("email-1"), reviewed by counsel before any address is collected.

## Decision

- `/privacy` serves version "landing-1" (`lib/privacy.ts`, `components/landing/PrivacyNotice.tsx`). It replaces the placeholder, so the landing release check passes.
- Short sentences, no legal boilerplate, no claims about which laws apply. It is not marked as a draft: every sentence is a fact about the site or about Vercel's published documentation, and each is listed below with its source.
- A version is fixed once published. When the site changes what it does, the notice gets a new version before the change ships.

## Every factual sentence and its source

| Sentence | Source |
| --- | --- |
| This site does not collect anything about you. | No form, input, cookie, analytics or storage of visitor data in the landing release: `components/landing/`, `app/page.tsx`, `app/privacy/page.tsx`, `app/layout.tsx`; checked by `tests/e2e/landing.spec.ts` ("what it says matches what the site does"). The site's own code writes no logs of visitors. |
| It has no sign-up form, no comments and no accounts. | `components/landing/LandingPage.tsx` shows the closed sign-up text, not a form; comments and admin are 404 in landing mode (`lib/access.ts`, `lib/routes.ts`). |
| It sets no cookies. | No `Set-Cookie` anywhere in the code; `tests/e2e/landing.spec.ts` checks the cookie jar is empty on `/` and `/privacy`. |
| It uses no analytics and no tracking. | No analytics package in `package.json`; CSP `script-src 'self'` (`lib/security-headers.ts`). |
| It loads nothing from other websites. | CSP `default-src 'self'` and font, image and connect sources `'self'` (`lib/security-headers.ts`); `tests/e2e/landing.spec.ts` checks every request goes to the site's own origin. |
| If you pick a theme at the bottom of the page, your browser saves that choice on your device. | `components/ThemeSwitch.tsx` writes `vt-theme` to `localStorage` only when Dark or Light is chosen; `tests/e2e/landing.spec.ts` checks it is the only key. |
| It is not sent to us. | `localStorage` is not sent with requests; nothing in the code reads it on the server. |
| This site is hosted by Vercel. | Matthew's hosting choice (ADR 0001; `vercel.json`). |
| To show you a page, your browser connects to Vercel's servers. Like any web server, they see your IP address and the page you ask for. | How HTTP works; Vercel documents reading the visitor's IP address from the request: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package (`ipAddress`). |
| Vercel keeps logs of requests to this site, such as the time, the page and the result. | Vercel's logs API returns, for each request, a timestamp, the request path and the response status code: https://vercel.com/docs/rest-api/logs/get-logs-for-a-deployment |
| To learn how Vercel handles this information, read Vercel's privacy notice. | https://vercel.com/legal/privacy-notice (link only; the notice states no retention period and does not paraphrase Vercel's policy). |
| The links to our publications go to Substack. The Discord link goes to Discord. | `content/landing.json`. Both publications are on Substack; a custom domain, once verified, still points at Substack. |
| When you follow one, you leave this site, and that service's own privacy rules apply. | Each is a plain link with no embed or script (`components/ExternalLink.tsx`). |
| This site asks your browser to tell them only that you came from vt-infinite.com, not which page. | `Referrer-Policy: strict-origin-when-cross-origin` (`lib/security-headers.ts`); checked by `tests/e2e/landing.spec.ts`. |
| The email list is not open yet. | `components/landing/LandingPage.tsx` ("Updates sign-up opens soon"); no email endpoint exists. |
| Before it opens, this notice will be replaced with a new version. No email address will be collected before then. | A commitment, not a fact about the code: Matthew's decision for stage 5L-2 (PR 3 serves "email-1" and its release check refuses the list without it). |
| Email matthew@vt-infinite.com. | `content/landing.json` (`contactEmail`). |

## Not verified in this pull request

- The build session could not open vercel.com (the session's network policy refused it). The two documentation pages above were read through Vercel's documentation search; the privacy notice URL came from a web search and was not opened. Matthew should open all three before the cutover and confirm they still say what this table says. No retention period is stated, because none could be cited.
