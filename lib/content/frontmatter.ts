import { parse } from "yaml";

export type Split = { data: unknown; body: string };

/**
 * Split a `---` fenced YAML header from the body. YAML is parsed with the
 * core schema (no timestamps or custom tags), and duplicate keys fail.
 */
export function splitFrontmatter(source: string): Split {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) throw new Error("missing frontmatter: the file must start with ---");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("unterminated frontmatter");
  const header = text.slice(4, end);
  const data: unknown = parse(header, { schema: "core", uniqueKeys: true, strict: true, prettyErrors: true, maxAliasCount: 0 });
  return { data, body: text.slice(end + 5) };
}
