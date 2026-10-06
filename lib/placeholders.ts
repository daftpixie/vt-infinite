/**
 * Every gap the site shows instead of unapproved or unsupplied content.
 * The release checklist requires this table to be empty for any route
 * that is released.
 */
export const PLACEHOLDERS = {
  contactEmail: { what: "confirmed organizational email, verified active before launch", owner: "Matthew J Adams" },
  communityLink: { what: "confirmed VT Infinite Discord invitation", owner: "Matthew J Adams" },
  mark: { what: "signed mark artwork (vector master with the D5 wordmark)", owner: "Matthew J Adams" },
  lorenzFigure: { what: "computed Lorenz figure with still frame and caption (stage 2)", owner: "build" },
  directionsOfWork: { what: "directions of work with dated status records and evidence links", owner: "Matthew J Adams" },
  oneRhythmSummary: { what: "OneRhythm plan summary; held until the plan clears its gate (R4)", owner: "Matthew J Adams" },
  roverDemoEntry: { what: "link to the labeled Marrs Rover demo, once it exists (R5)", owner: "build" },
  governanceIntro: { what: "Home introduction to the proposed governance; counsel sign-off and Matthew's wording (R11)", owner: "Matthew J Adams and counsel" },
  governanceSummary: { what: "proposed-governance summary of 150 words or fewer; counsel sign-off and Matthew's wording (R11)", owner: "Matthew J Adams and counsel" },
  governanceReviewed: { what: "last-reviewed date from the approved governance record", owner: "Matthew J Adams" },
  codeRepos: { what: "approved public repositories with dated status and evidence (G-1)", owner: "Matthew J Adams" },
  vibesNowPlaying: { what: "now playing, once the founder Spotify authorization clears (S-1)", owner: "Matthew J Adams" },
  agencyStory: { what: "Matthew's account, the meaning of the name and mark, and his principles", owner: "Matthew J Adams" },
  mandelbrotFigure: { what: "computed Mandelbrot figure (stage 2; approved kernel or acceptance of a new one, P7)", owner: "Matthew J Adams" },
  roverIntro: { what: "Marrs Rover introduction in future or demo wording", owner: "Matthew J Adams" },
  roverAttribution: { what: "sentence about the origin of the name, in wording Matthew approves (MR-1)", owner: "Matthew J Adams" },
  roverMethod: { what: "disclosure policy, definitions, governance and limits of proof (MR-14)", owner: "Matthew J Adams" },
  roverVerify: { what: "verification instructions, once the verifier exists (MR-34)", owner: "build" },
  policyComments: { what: "approved comment policy (R2)", owner: "Matthew J Adams and counsel" },
  policyPrivacy: { what: "approved privacy notice (R2, Q-12)", owner: "Matthew J Adams and counsel" },
  policyTerms: { what: "approved terms (R2)", owner: "Matthew J Adams and counsel" },
} as const;

export type PlaceholderId = keyof typeof PLACEHOLDERS;
