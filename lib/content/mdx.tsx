import type { Root as HastRoot } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root as MdastRoot } from "mdast";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { CrisisSupport } from "@/components/CrisisSupport";
import { MarginNote, MethodNote, SourceNote } from "@/components/prose";

/**
 * Trusted authored MDX (PRD W-1). Reviewed local files may use Markdown and
 * the approved components below, with literal string attributes only.
 * ESM (import/export), JavaScript expressions, raw HTML elements and
 * attribute spreads are refused, so nothing in a content file is ever
 * executed: the tree is validated, then rendered as data.
 */
export const APPROVED_COMPONENTS = {
  CrisisSupport,
  MarginNote,
  MethodNote,
  SourceNote,
} as const;

// A site path may not start with //, /\ or \\ (browsers read all three as another host).
const SAFE_HREF = /^(?:https:\/\/|http:\/\/|mailto:|#|\/(?![\/\\]))/i;

type Node = {
  type: string;
  name?: string | null;
  url?: string;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  position?: { start: { line: number } };
};

export class ContentError extends Error {}

function at(node: Node): string {
  return node.position ? ` (line ${node.position.start.line})` : "";
}

const processor = unified().use(remarkParse).use(remarkMdx);

export function parseMdx(body: string): MdastRoot {
  let tree: MdastRoot;
  try {
    tree = processor.parse(body) as MdastRoot;
  } catch (err) {
    throw new ContentError(`MDX syntax: ${(err as Error).message}`);
  }
  const problems: string[] = [];
  visit(tree, (n) => {
    const node = n as Node;
    switch (node.type) {
      case "mdxjsEsm":
        problems.push(`import/export is not allowed${at(node)}`);
        break;
      case "mdxFlowExpression":
      case "mdxTextExpression":
        problems.push(`expressions are not allowed${at(node)}`);
        break;
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement": {
        if (!node.name || !Object.hasOwn(APPROVED_COMPONENTS, node.name)) {
          problems.push(`<${node.name ?? ""}> is not an approved component${at(node)}`);
        }
        for (const a of node.attributes ?? []) {
          if (a.type !== "mdxJsxAttribute" || (a.value !== null && a.value !== undefined && typeof a.value !== "string")) {
            problems.push(`only literal string attributes are allowed${at(node)}`);
          }
        }
        break;
      }
      case "image":
      case "imageReference":
        problems.push(`inline images are not allowed; use the cover field${at(node)}`);
        break;
      case "link":
      case "definition":
        if (!node.url || !SAFE_HREF.test(node.url)) problems.push(`unsafe link ${JSON.stringify(node.url)}${at(node)}`);
        break;
    }
  });
  if (problems.length) throw new ContentError(problems.join("; "));
  return tree;
}

/** True when the tree uses the crisis-support component (PRD Q-1). */
export function usesCrisisSupport(tree: MdastRoot): boolean {
  let found = false;
  visit(tree, (n) => {
    const node = n as Node;
    if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "CrisisSupport") found = true;
  });
  return found;
}

function ProseLink({ href = "", children, ...rest }: ComponentProps<"a">): ReactNode {
  const external = /^https?:\/\//i.test(href);
  return (
    <a href={href} {...rest}>
      {children}
      {external ? (
        <>
          {" ↗"}
          <span className="visually-hidden"> (opens another site)</span>
        </>
      ) : null}
    </a>
  );
}

const toHast = unified().use(remarkRehype, {
  passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"],
});

type Parent = { type: string; children?: Array<Node & Parent> };

/**
 * A component alone on its line is block content: lift it out of the
 * paragraph remark wraps it in, so an <aside> never lands inside a <p>.
 */
function liftBlockComponents(tree: MdastRoot): void {
  visit(tree, "paragraph", (n, index, parent) => {
    const para = n as unknown as Parent;
    const kids = (para.children ?? []).filter((c) => !(c.type === "text" && !String((c as { value?: string }).value ?? "").trim()));
    if (parent && typeof index === "number" && kids.length === 1 && kids[0]?.type === "mdxJsxTextElement") {
      (parent as unknown as Parent).children?.splice(index, 1, { ...kids[0], type: "mdxJsxFlowElement" });
    }
  });
}

/**
 * Approved components become plain hast elements with literal properties,
 * so the JSX runtime never needs an expression evaluator.
 */
function componentsToElements(tree: HastRoot): void {
  visit(tree, (n) => {
    const node = n as unknown as Node & { tagName?: string; properties?: Record<string, string>; data?: unknown };
    if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return;
    const properties: Record<string, string> = {};
    for (const a of node.attributes ?? []) if (a.name) properties[a.name] = typeof a.value === "string" ? a.value : "";
    node.type = "element";
    node.tagName = node.name ?? "div";
    node.properties = properties;
    delete node.attributes;
    delete node.name;
    delete node.data;
  });
}

export function renderMdx(tree: MdastRoot): ReactNode {
  const copy = structuredClone(tree);
  liftBlockComponents(copy);
  const hast = toHast.runSync(copy) as HastRoot;
  componentsToElements(hast);
  return toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
    components: { ...APPROVED_COMPONENTS, a: ProseLink },
  });
}
