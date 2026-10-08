import { PRIMARY_NAV } from "./site";

/** Shared head and styles for the self-contained pages the proxy answers with. */
function shell(title: string, nav: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · VT ∞</title>
<style>
@font-face{font-family:"JetBrains Mono";src:url("/fonts/JetBrainsMono-wght.woff2") format("woff2");font-weight:100 800;font-display:swap}
:root{--ground:#000;--figure:#fff;--text:#dadada;--muted:#909090;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--ground:#fff;--figure:#000;--text:#262626;--muted:#5d5d5d;color-scheme:light}}
html{background:var(--ground);color:var(--text);font-family:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace;font-variant-ligatures:none}
body{margin:0;font-size:1rem;line-height:1.75rem}
.wrap{max-width:72rem;margin:0 auto;padding:0 1rem}
h1{color:var(--figure);font-size:1.953125rem;line-height:2.5rem}
a{color:var(--figure);text-decoration:underline 1px;text-underline-offset:.2em}
a:hover,a:focus-visible{background:var(--figure);color:var(--ground)}
:focus-visible{outline:2px solid var(--figure);outline-offset:2px}
ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.5rem 1.5rem}
li a,.home a{display:inline-flex;min-height:2.75rem;align-items:center}
.skip{position:absolute;left:-999rem}.skip:focus{left:1rem;top:1rem;background:var(--figure);color:var(--ground);padding:.5rem}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${nav}<main id="main" class="wrap" tabindex="-1">
${body}
</main>
</body>
</html>`;
}

const GONE_LEAD = `<h1>This page is not available</h1>
<p>vt-infinite.com was rebuilt from an empty repository. The page at this address is not part of the new site at present.</p>`;

const HOME_LINK = `<p class="home"><a href="/">Go to the home page</a></p>`;

/**
 * Self-contained HTML for an explanatory 410 (PRD DN-6). Some of these
 * addresses are unavailable only until a review clears, so the wording
 * makes no claim about whether anything returns. It does not echo the
 * requested path: names may be under review, and reflecting input would be
 * an injection risk. In landing mode it links only to the landing page,
 * since every other page answers 404.
 */
export function gonePageHtml(landing = false): string {
  if (landing) return shell("Not available", "", `${GONE_LEAD}\n${HOME_LINK}`);
  const nav = PRIMARY_NAV.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("");
  return shell(
    "Not available",
    `<header class="wrap"><nav aria-label="Primary"><ul>${nav}</ul></nav></header>\n`,
    `${GONE_LEAD}
<p>Current work is on <a href="/words">Words</a> and <a href="/code">Code</a>. To ask about something that used to be here, see <a href="/contact">Contact</a>.</p>`,
  );
}

/**
 * The 404 the proxy answers with in landing mode, for every path outside
 * the landing release. Self-contained, so it never depends on a page the
 * build rendered for the full site. Same words as app/not-found.tsx.
 */
export function landingNotFoundHtml(): string {
  return shell("Not found", "", `<h1>Not found</h1>
<p>There is no page at this address.</p>
${HOME_LINK}`);
}
