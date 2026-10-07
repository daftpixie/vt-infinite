export type Finding = { rule: string; target?: string; match: string; message: string };
export type Rule = {
  id: string;
  scope: "repo" | "copy";
  description: string;
  check: (text: string, env?: Readonly<Record<string, string | undefined>>) => Array<{ match: string; message: string }>;
};
export const CRISIS_TEXT: string;
export const RULES: readonly Rule[];
export type GuardException = { rule: string; target?: string; targetPrefix?: string; match?: string; reason: string; approvedBy: string; approvedOn: string };
export const EXCEPTIONS: ReadonlyArray<GuardException>;
export function exceptionCovers(e: GuardException, target: string | undefined): boolean;
export type HashedEntry = { category: "retired"; words: number; sha256: string };
export function privateIdentifiers(env?: Readonly<Record<string, string | undefined>>): string[][];
export function containsSequence(words: readonly string[], needle: readonly string[]): boolean;
export const HASHED_PHRASES: readonly HashedEntry[];
export function matchHashed(text: string, entries: readonly HashedEntry[]): Array<{ match: string; message: string }>;
export function sentences(text: string): string[];
export function runRules(
  text: string,
  options?: { target?: string; scopes?: Array<"repo" | "copy">; env?: Readonly<Record<string, string | undefined>>; only?: readonly string[] },
): Finding[];
