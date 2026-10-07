# RFC 8785 test data

Input and expected canonical output for the JSON Canonicalization Scheme (RFC 8785), copied unchanged from the `testdata` folder of the reference implementation repository, `cyberphone/json-canonicalization`, by Anders Rundgren, the RFC's first author. That repository is licensed under the Apache License, Version 2.0 (copyright 2018 Anders Rundgren), the same licence as this repository.

- `input/*.json`: input JSON. One input, `values`, is stored as `input/values.json.hex`, the same bytes in hexadecimal. One of its numbers is written with 26 zeros after the decimal point, and this repository's `long-numeric-id` guard (written to catch provider IDs) fails any run of 15 or more digits. Hex keeps the published bytes exact without a guard exception; the test decodes it before use.
- `output/*.json`: the expected canonical bytes.
- `outhex/*.txt`: the same bytes in hexadecimal.

`tests/unit/ledger-canonical.test.ts` runs both canonicalizers in this repository against every file: the library's (`packages/ledger-proof`, using the `canonicalize` package) and the standalone verifier's own (`tools/ledger-verifier/lib/json.mjs`).

The RFC's own text could not be fetched from the build environment, so its Appendix B number table is not included. Both canonicalizers serialize numbers with ECMAScript's Number-to-String algorithm, which is what RFC 8785 §3.2.2.3 specifies. No Marrs Rover schema allows a JSON number: amounts, counts and sequences are canonical decimal strings.
