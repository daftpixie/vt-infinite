import { readFileSync } from "node:fs";

const constants = readFileSync(new URL("../app/constants.ts", import.meta.url), "utf8");

if (constants.includes("CONTACT_EMAIL_PLACEHOLDER")) {
  console.error("Set the founder-approved public contact email before building.");
  process.exit(1);
}
