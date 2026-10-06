# Security

## Reporting a vulnerability

Please report it privately through GitHub's private vulnerability reporting for this repository (the Security tab, "Report a vulnerability"), once the owner has enabled it. Do not open a public issue, and do not include real personal data in the report.

A published contact address and response-time commitment will be added here once they are confirmed. Until then this file makes no promise about response times.

## Scope

This repository holds the website only. It does not hold, and must never hold, signing keys, provider credentials, evidence-vault material or private financial records. If you find any of those here, report it as above.

## What the site does today

- Every route is an unreleased shell. There are no logins, forms, comments or payments.
- `/admin` and `/api/admin` return 404 for every request.
- Feature-gated pages and APIs return 404 unless their server-side flag is exactly `true`.
- Responses carry a Content Security Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy and a restrictive permissions policy. The script policy currently allows inline scripts; a nonce-based policy is planned before cutover.
