import { createHash } from "node:crypto";

/** Lowercase, keep letters and digits, collapse everything else to single spaces. */
export function normaliseWords(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The entry stored in hashed-phrases.json for a phrase. */
export function phraseEntry(phrase, category) {
  const words = normaliseWords(phrase);
  return { category, words: words.length, sha256: sha256(words.join(" ")) };
}
