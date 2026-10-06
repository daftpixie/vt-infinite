/**
 * Reduce untrusted feed HTML to plain text (PRD SS-3, SS-4). The result is
 * rendered by React as text, so it is escaped on output; this function only
 * has to remove markup and decode entities, never to make HTML safe.
 */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  times: "×",
  minus: "−",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      // Drop control characters and invalid code points rather than emit them.
      if (!Number.isFinite(code) || code < 0x20 || (code >= 0x7f && code < 0xa0) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
      return String.fromCodePoint(code);
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  const withoutBlocks = html.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const withoutTags = withoutBlocks.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
  return decodeEntities(withoutTags)
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
