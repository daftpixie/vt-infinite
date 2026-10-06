import type { Finding } from "../guards/rules.mjs";
export function listFiles(options?: { staged?: boolean }): string[];
export function scan(files: string[], env?: Readonly<Record<string, string | undefined>>): Finding[];
