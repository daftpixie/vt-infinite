#!/usr/bin/env node
// Local refresh on command (never on page views): calls the same route the
// scheduled job uses, on a running local server.
// Usage: CRON_SECRET=<local value> npm run refresh   (server on :3000)
const base = process.env.REFRESH_BASE_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("refresh: set CRON_SECRET to the value the local server was started with.");
  process.exit(2);
}
const res = await fetch(`${base}/api/cron/refresh`, { headers: { Authorization: `Bearer ${secret}` } });
console.log(`refresh: ${res.status} ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
