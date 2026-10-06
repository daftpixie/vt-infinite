#!/usr/bin/env node
// Fails CI when the PRIVATE_IDENTIFIERS secret is missing where it must be
// available, so the private-identifier guard can never pass vacuously.
// Pull requests from forks get no secrets; there the check is skipped with a
// warning. The secret's value is never printed.
import { privateIdentifiers } from "../guards/rules.mjs";

/**
 * @param {{ eventName?: string, repository?: string, headRepository?: string, value?: string }} ctx
 * @returns {{ status: "ok" | "fail" | "skip-fork", message: string }}
 */
export function privateConfigStatus({ eventName, repository, headRepository, value }) {
  const present = privateIdentifiers({ PRIVATE_IDENTIFIERS: value }).length > 0;
  const fromFork =
    (eventName === "pull_request" || eventName === "pull_request_target") &&
    Boolean(headRepository) &&
    headRepository !== repository;
  if (present) return { status: "ok", message: "PRIVATE_IDENTIFIERS is set; the private-identifier check will run." };
  if (fromFork) {
    return {
      status: "skip-fork",
      message: "Pull request from a fork: the PRIVATE_IDENTIFIERS secret is unavailable, so the private-identifier check was skipped.",
    };
  }
  return {
    status: "fail",
    message: "PRIVATE_IDENTIFIERS is empty. Add it under Settings → Secrets and variables → Actions; the private-identifier check cannot run without it.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = privateConfigStatus({
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    headRepository: process.env.PR_HEAD_REPOSITORY,
    value: process.env.PRIVATE_IDENTIFIERS,
  });
  if (result.status === "ok") console.log(result.message);
  else if (result.status === "skip-fork") console.log(`::warning title=Private-identifier check skipped::${result.message}`);
  else {
    console.log(`::error title=PRIVATE_IDENTIFIERS missing::${result.message}`);
    process.exit(1);
  }
}
