// The verifier's command-line logic: argument handling and the plain-words
// report. verify.mjs is the entry point; tests import this module directly.
import { priorProblems, verifyBundle } from "./checks.mjs";
import { checkGolden } from "./golden.mjs";

export const VERSION = "1.0.0";
const LIMIT = 25;

const word = (v, yes, no, none = "NOT CHECKED") => (v === true ? yes : v === false ? no : none);

function list(problems) {
  const shown = problems.slice(0, LIMIT).map((p) => `    - ${p}`);
  if (problems.length > LIMIT) shown.push(`    - … and ${problems.length - LIMIT} more`);
  return shown;
}

/** The plain-words report (PRD MR-36): one line per layer, never one overall "verified". */
export function report(r, prior = null) {
  const out = [`Marrs Rover verifier ${VERSION}`, `Folder: ${r.folder}`];
  if (r.environment) {
    const env = { "synthetic-demo": "Synthetic demo", "local-prototype": "Local prototype", devnet: "Devnet", "mainnet-pilot": "Mainnet pilot" }[r.environment] ?? r.environment;
    out.push(`Environment: ${env}.${r.demoLabel ? ` ${r.demoLabel}` : ""}`);
    out.push(`Entity: ${r.entityId}   Period: ${r.periodId}   Events: ${r.eventCount}`);
  }
  if (r.manifestDigest) out.push(`Manifest SHA-256: ${r.manifestDigest}`);
  if (r.root) out.push(`Published root:   ${r.root}`);
  out.push("");

  out.push(
    `Bundle: ${word(r.bundle.valid, "VALID", "INVALID")}${
      r.bundle.valid ? ` - every file matches the manifest; the ${r.eventCount} events are canonical, schema-valid and in order, and they give the published root.` : ""
    }`,
  );
  out.push(...list(r.bundle.problems));
  out.push(
    `Inclusion proofs: ${word(r.inclusion.valid, "VALID", "INVALID")}${r.inclusion.valid ? ` - ${r.inclusion.checked} of ${r.eventCount} events lead from their own bytes to the published root.` : r.inclusion.valid === null ? ` - ${r.inclusion.note ?? "no proofs could be read"}.` : ""}`,
  );
  out.push(...list(r.inclusion.problems));
  out.push(`Chain commitment: ${r.chain.state.toUpperCase()} - ${r.chain.note}.`);
  out.push(
    `Balance checks: ${word(r.balance.passed, "PASSED", "FAILED")}${
      r.balance.passed ? " - every summary total, bucket and restricted fund recomputes exactly from the full register." : r.balance.passed === null ? ` - ${r.balance.note ?? "the register could not be read, so nothing was recomputed"}.` : ""
    }`,
  );
  out.push(...list(r.balance.problems));
  const rec = r.reconciliation;
  out.push(
    `Reconciliation evidence: ${rec.evidence.toUpperCase()}${
      rec.status ? ` - the scope statement says ${rec.status.replace(/-/g, " ")}${rec.date ? ` on ${rec.date}` : ""}; ${rec.events} reconciliation event(s) in the register. ${rec.coverage}` : ""
    }`,
  );
  out.push(`    Open exceptions: ${rec.openExceptions.length}`);
  for (const x of rec.openExceptions) out.push(`    - ${x.id} (${x.kind}): ${x.description}`);
  out.push(
    `Independent report: ${r.review.report.toUpperCase()}${r.review.report === "present" ? ` - scope as stated: ${r.review.scope}` : " - the bundle includes no independent examination."}`,
  );
  out.push(
    r.expectedDigest
      ? `Which publication: ${r.expectedDigest === r.manifestDigest ? "MATCHED" : "MISMATCHED"} - the manifest SHA-256 ${r.expectedDigest === r.manifestDigest ? "equals" : "differs from"} the value given with --expect.`
      : "Which publication: NOT CHECKED - no outside manifest SHA-256 was given (--expect), so this result shows internal consistency only, not which publication this is.",
  );
  if (prior) out.push(`Prior publication: ${prior.length === 0 ? "CONTINUOUS - this bundle names the earlier root and keeps its events unchanged." : "BROKEN"}`, ...list(prior));
  out.push("");
  out.push("What this does and does not show: a valid bundle and proofs mean these files match this manifest and its root. They do not show that the source records are genuine, that every account is included, that amounts are classified correctly, or that any audit took place.");
  return out.join("\n");
}

export function main(argv) {
  const args = argv.slice(2);
  const flag = (n) => {
    const k = args.indexOf(n);
    if (k < 0) return null;
    const v = args[k + 1];
    args.splice(k, 2);
    return v ?? "";
  };
  const json = args.includes("--json");
  if (json) args.splice(args.indexOf("--json"), 1);
  if (args.includes("--version")) {
    console.log(VERSION);
    return 0;
  }
  const golden = flag("--golden");
  if (golden !== null) {
    const results = checkGolden(golden);
    for (const g of results) console.log(`${g.ok ? "REPRODUCED" : "MISMATCH  "} ${g.name}${g.ok ? ` (${g.leafCount} leaves, root ${g.root})` : `: ${g.problems.join("; ")}`}`);
    const ok = results.length > 0 && results.every((g) => g.ok);
    console.log(ok ? `All ${results.length} golden vectors reproduced by this verifier's own implementation.` : "At least one golden vector did not reproduce.");
    return ok ? 0 : 1;
  }
  const expect = flag("--expect");
  const priorDir = flag("--prior");
  if (args.length !== 1 || args[0].startsWith("--") || (expect !== null && !/^[0-9a-f]{64}$/.test(expect))) {
    console.error("usage: node verify.mjs <bundle folder> [--expect <manifest sha256>] [--prior <earlier bundle folder>] [--json]\n       node verify.mjs --golden <golden vectors folder>");
    return 2;
  }
  const r = verifyBundle(args[0], { expectDigest: expect });
  let prior = null;
  if (priorDir !== null) {
    const earlier = verifyBundle(priorDir);
    prior = earlier.bundle.valid ? priorProblems(r, earlier) : [`the earlier bundle is itself invalid: ${earlier.bundle.problems[0] ?? "unreadable"}`];
  }
  const ok = r.bundle.valid && r.inclusion.valid === true && r.balance.passed === true && (prior === null || prior.length === 0);
  if (json) {
    const { _events, _manifest, ...pub } = r;
    void _events;
    void _manifest;
    console.log(JSON.stringify({ verifier: VERSION, ...pub, prior: prior === null ? { state: "not checked" } : { state: prior.length ? "broken" : "continuous", problems: prior }, ok }, null, 2));
  } else {
    console.log(report(r, prior));
    console.log("");
    console.log(ok ? "Result: the bundle, its proofs and its arithmetic check out (exit 0)." : "Result: at least one check failed (exit 1).");
  }
  return ok ? 0 : 1;
}
