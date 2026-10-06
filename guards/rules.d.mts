export type Finding = { rule: string; target?: string; match: string; message: string };
export type Rule = {
  id: string;
  scope: "repo" | "copy";
  description: string;
  check: (text: string, env?: Readonly<Record<string, string | undefined>>) => Array<{ match: string; message: string }>;
};
export const CRISIS_TEXT: string;
export const RULES: readonly Rule[];
export const EXCEPTIONS: ReadonlyArray<{ rule: string; target: string; match?: string; reason: string; approvedBy: string; approvedOn: string }>;
export type HashedEntry = { category: "private" | "retired"; words: number; sha256: string };
export const HASHED_PHRASES: readonly HashedEntry[];
export function matchHashed(text: string, entries: readonly HashedEntry[]): Array<{ match: string; message: string }>;
export function sentences(text: string): string[];
export function runRules(
  text: string,
  options?: { target?: string; scopes?: Array<"repo" | "copy">; env?: Readonly<Record<string, string | undefined>> },
): Finding[];
