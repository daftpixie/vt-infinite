import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_LABEL, SCHEMA_IDS, type SchemaName } from "@/packages/ledger-proof/src/constants.ts";
import { readSchema, schemaIssues, SCHEMA_FILES } from "@/packages/ledger-proof/src/schemas.ts";
import { validate } from "@/tools/ledger-verifier/lib/schema.mjs";
import { clone, mr48, mr48Events } from "./ledger-helpers";

// Two independent validators read the same published schema files: Ajv in
// the library, and the verifier's own subset validator. They must agree.
const both = (name: SchemaName, v: unknown) => ({ ajv: schemaIssues(name, v).length === 0, own: validate(readSchema(name), v).length === 0 });

describe("schemas (MR-28 to MR-30)", () => {
  it("the verifier pins byte-identical copies of every published v1 schema and the currency mapping", () => {
    const lib = readdirSync("packages/ledger-proof/schemas/v1").sort();
    expect(readdirSync("tools/ledger-verifier/schemas/v1").sort()).toEqual(lib);
    for (const f of lib) expect(readFileSync(`tools/ledger-verifier/schemas/v1/${f}`, "utf8"), f).toBe(readFileSync(`packages/ledger-proof/schemas/v1/${f}`, "utf8"));
  });

  it("every schema declares draft 2020-12, a URN identifier and closes every object", () => {
    for (const name of Object.keys(SCHEMA_FILES) as SchemaName[]) {
      const s = readSchema(name) as Record<string, unknown>;
      expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(String(s.$id)).toMatch(/^urn:vt-infinite:marrs-rover:schema:/);
      const walk = (x: unknown) => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          if (o.type === "object" && o.properties && name !== "schemas") expect(o.additionalProperties, `${name}`).toBe(false);
          Object.values(o).forEach(walk);
        }
      };
      walk(s);
    }
  });

  it("no schema permits a JSON number: amounts, counts and sequences are canonical decimal strings", () => {
    for (const name of Object.keys(SCHEMA_FILES) as SchemaName[]) expect(JSON.stringify(readSchema(name)), name).not.toMatch(/"type":\s*"(?:number|integer)"/);
  });

  it("both validators accept every document of the MR-48 bundle", () => {
    for (const e of mr48Events()) expect(both("event", e)).toEqual({ ajv: true, own: true });
    for (const [file, name] of [
      ["summary.json", "summary"],
      ["scope.json", "scope"],
      ["manifest.json", "manifest"],
      ["proofs.json", "proofs"],
      ["exceptions.json", "exceptions"],
      ["corrections.json", "corrections"],
      ["budgets.json", "budgets"],
      ["approvals.json", "approvals"],
      ["schemas.json", "schemas"],
    ] as const) {
      expect(both(name, mr48(file)), file).toEqual({ ajv: true, own: true });
    }
  });

  const base = () => mr48Events()[0]!; // a receipt
  const reconciliation = () => mr48Events().find((e) => e.type === "reconciliation")!;
  const transfer = () => mr48Events().find((e) => e.type === "transfer")!;
  type E = ReturnType<typeof base>;
  const cases: [string, () => unknown][] = [
    ["an unknown key (a private field)", () => ({ ...base(), iban: "x" })],
    ["an unknown key inside a leg", () => ({ ...base(), cashLegs: [{ ...base().cashLegs[0], accountNumber: "x" }] })],
    ["a non-UUID event ID", () => ({ ...base(), eventId: "J-0001" })],
    ["an upper-case UUID", () => ({ ...base(), eventId: base().eventId.toUpperCase() })],
    ["a leading zero", () => ({ ...base(), amountMinorUnits: "0125000" })],
    ["a plus sign", () => ({ ...base(), amountMinorUnits: "+125000" })],
    ["negative zero", () => ({ ...base(), cashLegs: [{ ...base().cashLegs[0], deltaMinorUnits: "-0" }] })],
    ["a zero amount", () => ({ ...base(), amountMinorUnits: "0" })],
    ["a decimal amount", () => ({ ...base(), amountMinorUnits: "1250.00" })],
    ["a JSON number amount", () => ({ ...base(), amountMinorUnits: 125000 })],
    ["sequence zero", () => ({ ...base(), eventSequence: "0" })],
    ["a lower-case currency", () => ({ ...base(), currency: "usd" })],
    ["a non-UTC timestamp", () => ({ ...base(), publishedAt: "2000-04-14T16:00:00+01:00" })],
    ["an unknown type", () => ({ ...base(), type: "payment" })],
    ["a financial event without an amount", () => {
      const { amountMinorUnits, ...rest } = base();
      void amountMinorUnits;
      return rest;
    }],
    ["a financial event without legs", () => ({ ...base(), cashLegs: [] })],
    ["a reconciliation with an amount", () => ({ ...reconciliation(), amountMinorUnits: "1", currency: "USD" })],
    ["a reconciliation with a cash leg", () => ({ ...reconciliation(), cashLegs: base().cashLegs })],
    ["a reconciliation with a cash flow", () => ({ ...reconciliation(), classification: { ...reconciliation().classification, flow: "operating" } })],
    ["a receipt with a transfer kind", () => ({ ...base(), transferKind: "internal" })],
    ["a transfer without its kind", () => {
      const { transferKind, ...rest } = transfer();
      void transferKind;
      return rest;
    }],
    ["a transfer with a correction", () => ({ ...transfer(), correction: { originalEventId: base().eventId, kind: "replacement", reason: "x" } })],
    ["a reversal without its correction link", () => ({ ...base(), type: "reversal" })],
    ["a receipt claiming to be a reversal correction", () => ({ ...base(), correction: { originalEventId: base().eventId, kind: "reversal", reason: "x" } })],
    ["synthetic data without the demo label", () => {
      const { demoLabel, ...rest } = base();
      void demoLabel;
      return rest;
    }],
    ["a changed demo label", () => ({ ...base(), demoLabel: DEMO_LABEL.replace("—", "-") })],
    ["a real environment carrying the demo label", () => ({ ...base(), environment: "mainnet-pilot" })],
    ["a control character in the purpose", () => ({ ...base(), purpose: { text: "a\u0007b" } })],
    ["a purpose over 500 characters", () => ({ ...base(), purpose: { text: "x".repeat(501) } })],
    ["a native payment with an unknown payee kind", () => ({ ...base(), evidence: { reportRefs: [], nativePayment: { network: "solana-mainnet", signature: "5".repeat(88), payeeKind: "individual" } } })],
  ];

  it.each(cases)("both validators reject %s", (_, make) => {
    expect(both("event", make() as E)).toEqual({ ajv: false, own: false });
  });

  it("a real-environment event without the label is schema-valid (the label belongs to synthetic data only)", () => {
    const { demoLabel, ...rest } = base();
    void demoLabel;
    expect(both("event", { ...rest, environment: "local-prototype" })).toEqual({ ajv: true, own: true });
  });

  it("documents: an unknown key, a wrong schema ID, a missing label and a non-URL archive location are rejected by both", () => {
    const m = mr48<Record<string, unknown>>("manifest.json");
    for (const bad of [
      { ...m, signature: "x" },
      { ...m, schema: SCHEMA_IDS.event },
      (({ demoLabel, ...r }) => (void demoLabel, r))(m),
      { ...m, archiveLocations: ["ftp://example.invalid/x"] },
      { ...m, events: { ...(m.events as object), count: "24.0" } },
    ]) {
      expect(both("manifest", bad)).toEqual({ ajv: false, own: false });
    }
    const s = clone(mr48<Record<string, unknown>>("summary.json"));
    expect(both("summary", { ...s, currencies: [] })).toEqual({ ajv: false, own: false });
  });

  it("the verifier's validator refuses a schema with a keyword it does not implement, rather than ignore it", () => {
    expect(() => validate({ type: "string", format: "email" }, "x")).toThrow(/unsupported keyword format/);
    expect(() => validate({ $ref: "https://example.invalid/s.json" }, "x")).toThrow(/unsupported \$ref/);
  });
});
