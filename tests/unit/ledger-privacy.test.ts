import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalBytes } from "@/packages/ledger-proof/src/canonical.ts";
import { jsonFindings, scanBundle, textHits } from "@/packages/ledger-proof/src/privacy.ts";
import { bundleFiles, clone, copyBundle, MR48_DIR, mr48Events } from "./ledger-helpers";

// Every sensitive-looking value below is built at run time from synthetic
// parts, so no realistic bank number, card number or address sits in the
// repository. None of them belongs to anyone.

/** A string of digits with a valid ABA routing checksum. */
function syntheticRouting(): string {
  for (let n = 100000000; ; n++) {
    const d = String(n).split("").map(Number);
    const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
    if (sum % 10 === 0) return String(n);
  }
}
/** A 16-digit number with a valid Luhn check digit. */
function syntheticCard(): string {
  const body = `4${"0".repeat(14)}`;
  for (let c = 0; c <= 9; c++) {
    const s = body + c;
    let sum = 0;
    [...s].reverse().forEach((ch, i) => {
      let n = Number(ch);
      if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
      sum += n;
    });
    if (sum % 10 === 0) return s;
  }
  throw new Error("unreachable");
}
/** An IBAN-shaped value with valid check digits for a made-up bank code. */
function syntheticIban(): string {
  const bban = "TEST" + "0".repeat(6) + "12345678";
  const rearranged = (bban + "GB00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const d of rearranged) m = (m * 10 + Number(d)) % 97;
  return `GB${String(98 - m).padStart(2, "0")}${bban}`;
}
const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const syntheticWallet = () => Array.from({ length: 44 }, (_, k) => base58[(k * 7 + 3) % base58.length]).join("");

const purposeWith = (text: string) => {
  const e = clone(mr48Events()[0]!);
  e.purpose.text = text;
  return e;
};
const rulesFor = (text: string) => jsonFindings("register.jsonl", purposeWith(text) as never).map((f) => f.rule);

describe("privacy scan (MR-22 to MR-27)", () => {
  it("the MR-48 bundle has no findings", () => {
    expect(scanBundle(bundleFiles(MR48_DIR), { allowedPhrases: ["Synthetic Demo Organization (fictional)"] })).toEqual([]);
  });

  it.each([
    ["an IBAN", () => `Synthetic payment to ${syntheticIban()} (demo).`, "bank-iban"],
    ["a routing number", () => `Synthetic transfer via ${syntheticRouting()} (demo).`, "bank-routing"],
    ["a card number", () => `Synthetic charge on ${syntheticCard()} (demo).`, "card-number"],
    ["a long account-like number", () => `Synthetic account 0012${"3".repeat(8)} (demo).`, "account-like-number"],
    ["a SWIFT code", () => "Synthetic wire, SWIFT: TESTGB2LXXX (demo).", "bank-swift"],
    ["a personal name", () => "Synthetic reimbursement for Jane Placeholder (demo).", "personal-name"],
    ["an honorific and a name", () => "Synthetic fee for Dr. Placeholder (demo).", "personal-name"],
    ["a private approval", () => "Synthetic spend approved by Placeholder (demo).", "private-approval"],
    ["an email address", () => "Synthetic refund to someone@example.invalid (demo).", "email"],
    ["a phone number", () => "Synthetic call to 555-010-0199 (demo).", "phone"],
    ["a social security number", () => "Synthetic payroll 000-12-3456 (demo).", "us-ssn"],
    ["an individual's wallet address", () => `Synthetic payout to ${syntheticWallet()} (demo).`, "wallet-address"],
    ["an Ethereum address", () => `Synthetic payout to 0x${"ab".repeat(20)} (demo).`, "wallet-address"],
    ["a hex salt in free text", () => `Synthetic note ${"5a".repeat(32)} (demo).`, "secret-like-value"],
  ])("fails a bundle with %s", (_, make, rule) => {
    expect(rulesFor(make())).toContain(rule);
  });

  it("fails forbidden fields: salts, secrets, approvers, account numbers", () => {
    for (const key of ["salt", "supportingSalt", "privateKey", "approvedBy", "signer", "accountNumber", "iban", "payeeName", "seedPhrase"]) {
      const e = { ...purposeWith("Synthetic (demo)."), [key]: "x" };
      expect(jsonFindings("register.jsonl", e as never).map((f) => f.rule), key).toContain("forbidden-field");
    }
  });

  it("fails a keypair-shaped byte array and a native payment in a synthetic bundle", () => {
    expect(jsonFindings("x.json", { bytes: Array.from({ length: 64 }, (_, k) => k) } as never).map((f) => f.rule)).toContain("secret-like-value");
    const e = { ...purposeWith("Synthetic (demo)."), evidence: { reportRefs: [], nativePayment: { network: "solana-devnet", signature: "5".repeat(88), payeeKind: "company" } } };
    expect(jsonFindings("register.jsonl", e as never).map((f) => f.rule)).toContain("native-payment");
  });

  it("checks names from the private configuration without printing them", () => {
    const found = jsonFindings("register.jsonl", purposeWith("Synthetic payment for the zephyr project (demo).") as never, { privateIdentifiers: ["Zephyr Project"] });
    expect(found.map((f) => f.rule)).toContain("private-identifier");
    expect(JSON.stringify(found)).not.toContain("Zephyr");
  });

  it("never prints a matched value in full", () => {
    const iban = syntheticIban();
    const f = jsonFindings("register.jsonl", purposeWith(`Synthetic ${iban} (demo).`) as never);
    expect(JSON.stringify(f)).not.toContain(iban);
  });

  it("leaves amounts, digests, UUIDs and approved labels alone", () => {
    expect(textHits("Synthetic Demo Organization (fictional)", { allowedPhrases: ["Synthetic Demo Organization (fictional)"] })).toEqual([]);
    expect(textHits("Demo data — not VT Infinite's financial records.")).toEqual([]);
    const e = mr48Events()[0]!;
    expect(jsonFindings("register.jsonl", e as never)).toEqual([]);
  });

  it("scans CSV and Markdown too", () => {
    const files = bundleFiles(MR48_DIR);
    const csv = new TextDecoder().decode(files.get("register.csv")).replace("Synthetic receipt: program service fees, January (demo).", "Synthetic receipt from Jane Placeholder (demo).");
    files.set("register.csv", new TextEncoder().encode(csv));
    files.set("verify.md", new TextEncoder().encode(`Contact someone@example.invalid`));
    const rules = scanBundle(files).map((f) => `${f.file}:${f.rule}`);
    expect(rules).toContain("register.csv:personal-name");
    expect(rules).toContain("verify.md:email");
  });

  it("the release-check script passes the MR-48 bundle and fails a bundle with a leak", () => {
    const ok = spawnSync(process.execPath, ["scripts/ledger-privacy-scan.ts", MR48_DIR], { encoding: "utf8", env: { ...process.env, PRIVATE_IDENTIFIERS: "" } });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/no findings in 12 files/);
    const dir = copyBundle();
    writeFileSync(join(dir, "approvals.json"), canonicalBytes({ approvals: [{ approvedBy: "Jane Placeholder" }] }));
    const bad = spawnSync(process.execPath, ["scripts/ledger-privacy-scan.ts", dir], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/forbidden-field/);
    expect(bad.stdout).not.toContain("Jane Placeholder");
  });
});
