/**
 * Every gap the site shows instead of unapproved or unsupplied content.
 * The release checklist requires this table to be empty for any route
 * that is released.
 */
export const PLACEHOLDERS = {
  contactEmail: { what: "confirmed organizational email, verified active before launch", owner: "Matthew J Adams" },
  communityLink: { what: "confirmed VT Infinite Discord invitation", owner: "Matthew J Adams" },
  mark: { what: "signed mark artwork (vector master with the D5 wordmark)", owner: "Matthew J Adams" },
  directionsOfWork: { what: "directions of work with dated status records and evidence links", owner: "Matthew J Adams" },
  oneRhythmSummary: { what: "OneRhythm plan summary; held until the plan clears its gate (R4)", owner: "Matthew J Adams" },
  oneRhythmPlanIntro: { what: "approved description of the OneRhythm plan and what it shows (P11)", owner: "Matthew J Adams" },
  governanceIntro: { what: "Home introduction to the proposed governance; counsel sign-off and Matthew's wording (R11)", owner: "Matthew J Adams and counsel" },
  governanceSummary: { what: "proposed-governance summary of 150 words or fewer; counsel sign-off and Matthew's wording (R11)", owner: "Matthew J Adams and counsel" },
  governanceReviewed: { what: "last-reviewed date from the approved governance record", owner: "Matthew J Adams" },
  codeRepos: { what: "approved public repositories with dated status and evidence (G-1)", owner: "Matthew J Adams" },
  vibesNowPlaying: { what: "now playing, once the founder Spotify authorization clears (S-1)", owner: "Matthew J Adams" },
  agencyStory: { what: "Matthew's account, the meaning of the name and mark, and his principles", owner: "Matthew J Adams" },
  mandelbrotFigure: { what: "computed Mandelbrot figure, built and held until Matthew approves its kernel (P7)", owner: "Matthew J Adams" },
  roverIntro: { what: "Marrs Rover introduction in future or demo wording", owner: "Matthew J Adams" },
  roverAttribution: { what: "sentence about the origin of the name, in wording Matthew approves (MR-1)", owner: "Matthew J Adams" },
  roverDisclosurePolicy: {
    what: "disclosure scope, redaction rules, publication delay, control roles, authority changes and corrections policy for real publications (MR-14, MR-23, MR-26, MR-47); accounting and privacy decisions, with counsel where needed",
    owner: "Matthew J Adams",
  },
  roverVerifierSource: { what: "approved public link to the verifier's source (tools/ledger-verifier), once its repository is listed on Code (G-1)", owner: "Matthew J Adams" },
  policyComments: { what: "approved comment policy (R2)", owner: "Matthew J Adams and counsel" },
  policyPrivacy: { what: "approved privacy notice (R2, Q-12)", owner: "Matthew J Adams and counsel" },
  policyTerms: { what: "approved terms (R2)", owner: "Matthew J Adams and counsel" },
} as const;

export type PlaceholderId = keyof typeof PLACEHOLDERS;
