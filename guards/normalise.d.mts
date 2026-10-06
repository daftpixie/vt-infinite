export function normaliseWords(text: string): string[];
export function sha256(s: string): string;
export function phraseEntry(phrase: string, category: "private" | "retired"): { category: "private" | "retired"; words: number; sha256: string };
