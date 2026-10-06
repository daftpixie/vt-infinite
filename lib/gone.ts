import { PRIMARY_NAV } from "./site";

/**
 * Self-contained HTML for an explanatory 410 (PRD DN-6). Some of these
 * addresses are unavailable only until a review clears, so the wording
 * makes no claim about whether anything returns. It does not echo the
 * requested path: names may be under review, and reflecting input would be
 * an injection risk.
 */
export function gonePageHtml(): string {
  const nav = PRIMARY_NAV.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not available · VT ∞</title>
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
li a{display:inline-flex;min-height:2.75rem;align-items:center}
.skip{position:absolute;left:-999rem}.skip:focus{left:1rem;top:1rem;background:var(--figure);color:var(--ground);padding:.5rem}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="wrap"><nav aria-label="Primary"><ul>${nav}</ul></nav></header>
<main id="main" class="wrap" tabindex="-1">
<h1>This page is not available</h1>
<p>vt-infinite.com was rebuilt from an empty repository. The page at this address is not part of the new site at present.</p>
<p>Current work is on <a href="/words">Words</a> and <a href="/code">Code</a>. To ask about something that used to be here, see <a href="/contact">Contact</a>.</p>
</main>
</body>
</html>`;
}
