// Copy and claim guards (PRD Q-1 to Q-6; brand reference §05–§06).
//
// Two scopes:
//   "repo": every tracked text file and every rendered page.
//   "copy": rendered page text and files under content/ — the words a
//           reader sees. Code comments and specs are not public copy.
//
// Matches are prompts for review, not proof of safety (PRD A-6, Q-2).
// A legitimate use is recorded in guards/exceptions.json with a reason
// and the person who approved it; it is never silenced in place.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normaliseWords, sha256 } from "./normalise.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HASHED = JSON.parse(readFileSync(join(here, "hashed-phrases.json"), "utf8"));
export const EXCEPTIONS = JSON.parse(readFileSync(join(here, "exceptions.json"), "utf8"));

export const CRISIS_TEXT =
  "If you are thinking about suicide, call or text 988 in the US, or your local crisis line. If your heart is in trouble right now, call 911 or your local emergency number, or follow the plan your care team gave you.";

function regexFindings(text, re, message) {
  const out = [];
  for (const m of text.matchAll(re)) out.push({ match: m[0], message });
  return out;
}

export function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Brand §06 "Words to avoid", applied to public copy.
const AVOID = [
  ["dominate", /\bdominat(?:e|es|ed|ing)\b/gi],
  ["weaponize", /\bweaponi[sz](?:e|es|ed|ing)\b/gi],
  ["crush", /\bcrush(?:es|ed|ing)?\b/gi],
  ["kill", /\bkill(?:s|ed|ing)?\b/gi],
  ["strike", /\bstrik(?:e|es|ing)\b/gi],
  ["god-mode", /\bgod[- ]mode\b/gi],
  ["rogue", /\brogue\b/gi],
  ["fossil", /\bfossils?\b/gi],
  ["fire", /\bfire\b/gi],
  ["explosive", /\bexplosive\b/gi],
  ["donation", /\bdonat(?:ion|ions|e|ed|ing)\b/gi],
  ["cure", /\bcur(?:e|es|ed)\b/gi],
  ["healed", /\bhealed\b/gi],
  ["world's first", /\bworld['’]s first\b/gi],
  ["zero competitors", /\bzero competitors\b/gi],
  ["nobody else does this", /\bnobody else does this\b/gi],
  ["independently audited", /\bindependently audited\b/gi],
  ["validated", /\bvalidated\b/gi],
  ["clinically proven", /\bclinically proven\b/gi],
  ["FDA-cleared", /\bFDA[- ]cleared\b/gi],
  ["built in public", /\bbuilt in public\b/gi],
  ["open source", /\bopen[- ]source\b/gi],
  ["immutable", /\bimmutab(?:le|ility)\b/gi],
  ["permanent", /\bpermanent(?:ly)?\b/gi],
  ["forever", /\bforever\b/gi],
  ["token", /\btokens?\b/gi],
  ["coin", /\bcoins?\b/gi],
  ["stablecoin", /\bstablecoins?\b/gi],
  ["yield", /\byields?\b/gi],
  ["returns", /\breturns\b/gi],
  ["invest", /\binvest(?:s|ed|ing|ment|ments|or|ors)?\b/gi],
  ["raise", /\brais(?:e|es|ed|ing)\b/gi],
  ["users", /\busers?\b/gi],
  ["empower", /\bempower(?:s|ed|ing|ment)?\b/gi],
  ["revolutionize", /\brevolutioni[sz](?:e|es|ed|ing)\b/gi],
  ["disrupt", /\bdisrupt(?:s|ed|ing|ion|ive)?\b/gi],
  ["seamless", /\bseamless(?:ly)?\b/gi],
  ["game-changing", /\bgame[- ]chang(?:ing|er)\b/gi],
  ["unlock", /\bunlock(?:s|ed|ing)?\b/gi],
  ["AI-powered", /\bAI[- ]powered\b/gi],
];

// Brand §06 "Names": wrong forms. Case-sensitive on purpose.
const WRONG_NAMES = [
  [/\bVTI\b/g, "VT Infinite"],
  [/\bVT-Infinite\b/g, "VT Infinite"],
  [/\bVTInfinite\b/g, "VT Infinite"],
  [/\bOne Rhythm\b/g, "OneRhythm"],
  [/\bOnerhythm\b/g, "OneRhythm"],
  [/\bMirmade\b/g, "MIRmade"],
  [/\bMIR-made\b/g, "MIRmade"],
  [/\bAbl8\b/g, "abl8"],
  [/\bABL8\b/g, "abl8"],
  [/\bAgentOS\b/g, "agentOS"],
  [/\bAgent OS\b/g, "agentOS"],
];

const INITIATIVES = /\b(?:OneRhythm|MIRmade|abl8)\b/i;
const CLINICAL = /\b(?:diagnos(?:e|es|ed|ing|is)|detect(?:s|ed|ing)?|treat(?:s|ed|ing|ment)?|prevent(?:s|ed|ing)?)\b/i;

/** Find phrases whose normalised SHA-256 is in `entries` (see scripts/hash-phrase.mjs). */
export function matchHashed(text, entries) {
  const words = normaliseWords(text);
  const out = [];
  for (const n of new Set(entries.map((h) => h.words))) {
    const wanted = new Map(entries.filter((h) => h.words === n).map((h) => [h.sha256, h.category]));
    for (let i = 0; i + n <= words.length; i++) {
      const category = wanted.get(sha256(words.slice(i, i + n).join(" ")));
      if (category) {
        out.push({
          match: `${category} phrase (${n} words) at word ${i}`,
          message: category === "private" ? "A private identifier must not enter the public repository." : "Retired legacy copy must not return.",
        });
      }
    }
  }
  return out;
}

export const HASHED_PHRASES = HASHED;

export const RULES = [
  {
    id: "byline",
    scope: "repo",
    description: "The byline is Matthew J Adams, with no period (PRD Q-3).",
    check: (t) => regexFindings(t, /Matthew J\. Adams/g, "Use “Matthew J Adams” with no period."),
  },
  {
    id: "marrs-spelling",
    scope: "repo",
    description: "Marrs Rover has two Rs (PRD MR-1).",
    check: (t) =>
      [...t.matchAll(/\bmar+['’]?s?['’]?[\s-]+rover\b/gi)]
        .filter((m) => !/^(?:Marrs Rover|MARRS ROVER|marrs-rover)$/.test(m[0]))
        .map((m) => ({ match: m[0], message: "Write “Marrs Rover” (two Rs)." }))
        .concat(regexFindings(t, /\bJonathan Mar(?:s|r)?\b(?!s)/g, "Marrs has two Rs.")),
  },
  {
    id: "marrs-attribution",
    scope: "repo",
    description: "Any sentence about the person Marrs Rover is named for stays a placeholder until Matthew approves it (PRD MR-1).",
    check: (t) => regexFindings(t, /\bJonathan Marrs\b/g, "Attribution text needs Matthew's approved wording; use the placeholder."),
  },
  {
    id: "pbc-status",
    scope: "repo",
    description: "VT Infinite, Inc. is a Delaware C-corp; the PBC conversion is not filed (PRD R10; brand §01).",
    check: (t) => [
      ...regexFindings(t, /\bVT Infinite,?\s+PBC\b/gi, "The company is not a PBC."),
      ...regexFindings(
        t,
        /\bVT Infinite(?:,\s*Inc\.?)?,?\s+(?:is|became|has become|operates as)\s+(?:now\s+)?an?\s+(?:Delaware\s+)?(?:public benefit corporation|PBC)\b/gi,
        "The company is not a PBC.",
      ),
    ],
  },
  {
    id: "initiative-pairing",
    scope: "repo",
    description: "MIRmade and OneRhythm are never named in the same claim (PRD Q-4; brand §06).",
    check: (t) =>
      sentences(t)
        .filter((s) => /\bMIRmade\b/i.test(s) && /\bOneRhythm\b/i.test(s))
        .map((s) => ({ match: s.slice(0, 160), message: "Separate MIRmade and OneRhythm into separate claims." })),
  },
  {
    id: "hashed-phrases",
    scope: "repo",
    description: "No private identifiers (PRD Q-6) and no retired legacy copy (PRD DN-1, DN-8).",
    check: (t) => matchHashed(t, HASHED),
  },
  {
    id: "private-env-identifiers",
    scope: "repo",
    description: "Identifiers listed in the PRIVATE_IDENTIFIERS environment variable never appear (PRD A-1, Q-6).",
    check: (t, env = process.env) =>
      (env.PRIVATE_IDENTIFIERS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
        .filter((s) => t.toLowerCase().includes(s.toLowerCase()))
        .map(() => ({ match: "[value from PRIVATE_IDENTIFIERS]", message: "A private identifier must not enter the public repository." })),
  },
  {
    id: "long-numeric-id",
    scope: "repo",
    description: "Runs of 15 or more digits look like provider IDs (for example Asana GIDs) and need review (PRD A-1).",
    check: (t) => regexFindings(t, /(?<![0-9a-zA-Z])\d{15,}(?![0-9a-zA-Z])/g, "Long numeric identifier: keep provider IDs in the host's environment."),
  },
  {
    id: "secrets",
    scope: "repo",
    description: "No keys, tokens or keypairs (PRD Q-11; kickoff hard rules).",
    check: (t) => [
      ...regexFindings(t, /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, "Private key block."),
      ...regexFindings(t, /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, "GitHub token."),
      ...regexFindings(t, /\bAKIA[0-9A-Z]{16}\b/g, "AWS access key."),
      ...regexFindings(t, /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g, "Live API secret key."),
      ...regexFindings(t, /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "Slack token."),
      ...regexFindings(t, /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "JSON Web Token (for example a database service key)."),
      ...regexFindings(t, /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/g, "Looks like a Solana keypair (64-byte array)."),
    ],
  },
  {
    id: "brand-words",
    scope: "copy",
    description: "Brand §06 words to avoid, in public copy.",
    check: (t) => AVOID.flatMap(([word, re]) => regexFindings(t, re, `Brand §06 avoids “${word}”.`)),
  },
  {
    id: "brand-names",
    scope: "copy",
    description: "Canonical names (brand §06).",
    check: (t) => WRONG_NAMES.flatMap(([re, right]) => regexFindings(t, re, `Write “${right}”.`)),
  },
  {
    id: "pbc-mention",
    scope: "copy",
    description: "No mention of the PBC conversion in public copy until counsel signs off (brand §06; PRD R11).",
    check: (t) => regexFindings(t, /\bPBC\b|\bpublic benefit corporation\b/gi, "PBC copy waits for counsel (R11)."),
  },
  {
    id: "clinical-function",
    scope: "copy",
    description: "No clinical function claimed for an initiative (brand §06).",
    check: (t) =>
      sentences(t)
        .filter((s) => INITIATIVES.test(s) && CLINICAL.test(s))
        .map((s) => ({ match: s.slice(0, 160), message: "Describe support and research, not clinical function." })),
  },
  {
    id: "funding-ask",
    scope: "copy",
    description: "No funding asks or investment language (kickoff copy rules).",
    check: (t) => regexFindings(t, /\b(?:fund (?:us|our|the)|support us financially|back us|become a (?:partner|backer|sponsor))\b/gi, "No funding asks."),
  },
  {
    id: "crisis-block",
    scope: "copy",
    description: "Wherever suicide is mentioned, the house crisis block appears verbatim (PRD C-4, Q-1).",
    check: (t) => {
      if (!/suicid/i.test(t)) return [];
      const flat = t.replace(/\s+/g, " ");
      return flat.includes(CRISIS_TEXT) ? [] : [{ match: "mention of suicide", message: "Add the crisis-support block, verbatim." }];
    },
  },
];

/**
 * Run rules over one text. `target` is a repo path or a route; exceptions
 * match on rule ID, target and the matched text.
 */
export function runRules(text, { target, scopes = ["repo", "copy"], env = process.env } = {}) {
  const findings = [];
  for (const rule of RULES) {
    if (!scopes.includes(rule.scope)) continue;
    for (const f of rule.check(text, env)) {
      const excepted = EXCEPTIONS.some(
        (e) => e.rule === rule.id && e.target === target && (e.match === undefined || e.match === f.match),
      );
      if (!excepted) findings.push({ rule: rule.id, target, ...f });
    }
  }
  return findings;
}
