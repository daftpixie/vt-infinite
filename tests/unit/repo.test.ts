import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";
import { listFiles, scan } from "@/scripts/guard.mjs";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** The only commit made before this build: the LICENSE on main. */
const ROOT_COMMIT = "35d3b17f9ac412e4886d0a0f2b9ac4024ac76255";

/** Top-level entries the new tree is allowed to contain (DN-1, DN-8). */
const ALLOWED_TOP = new Set([
  ".github", ".gitignore", ".husky", ".npmrc", ".nvmrc", ".secretlintignore", ".secretlintrc.json",
  "CLAUDE.md", "CONTRIBUTING.md", "LICENSE", "README.md", "SECURITY.md",
  "app", "components", "content", "db", "docs", "eslint.config.mjs", "guards", "lib", "next.config.ts",
  "package-lock.json", "package.json", "playwright.config.ts", "proxy.ts", "public", "scripts",
  "tests", "tsconfig.json", "vitest.config.mts",
]);

describe("fresh tree: nothing from the legacy site", () => {
  it("has one root commit, the LICENSE commit on main", () => {
    const shallow = git("rev-parse", "--is-shallow-repository");
    expect(shallow, "run with full history (fetch-depth: 0)").toBe("false");
    expect(git("rev-list", "--max-parents=0", "HEAD").split("\n")).toEqual([ROOT_COMMIT]);
  });

  it("tracks only the expected top-level entries", () => {
    const top = new Set(listFiles().map((f) => f.split("/")[0]!));
    expect([...top].filter((t) => !ALLOWED_TOP.has(t))).toEqual([]);
  });

  it("passes every repository guard (secrets, private identifiers, retired copy, claims)", () => {
    expect(scan(listFiles())).toEqual([]);
  });
});

describe("route contracts (PRD §04)", () => {
  it.each(ROUTES.map((r) => [r.path, r.file]))("%s is implemented by %s", (_path, file) => {
    expect(existsSync(file)).toBe(true);
  });
});
