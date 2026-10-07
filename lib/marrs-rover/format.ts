import { formatDateTime, formatDay } from "@/lib/content/dates";

/**
 * Money display (PRD MR-19; brand §05 "Money" and "Minus"). Amounts are
 * integer minor units held as BigInt and are never passed through a float.
 * Dollars show to the cent ($1,250.00); any other currency shows its code.
 * Direction is always written in words, never shown by colour alone.
 */
const CANONICAL_INT = /^(?:0|-?[1-9][0-9]*)$/;
const SYMBOLS: Record<string, string> = { USD: "$" };

function toBig(minor: string | bigint): bigint {
  if (typeof minor === "bigint") return minor;
  if (!CANONICAL_INT.test(minor)) throw new TypeError("not a canonical integer amount");
  return BigInt(minor);
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The magnitude of an amount, formatted for its currency: "$1,250.00", "1,250 JPY". */
export function formatAmount(minor: string | bigint, currency: string, exponents: Record<string, number>): string {
  const exp = exponents[currency];
  if (exp === undefined || !Number.isInteger(exp) || exp < 0) throw new RangeError(`no exponent for ${currency}`);
  const n = toBig(minor);
  const abs = (n < 0n ? -n : n).toString().padStart(exp + 1, "0");
  const whole = group(abs.slice(0, abs.length - exp));
  const number = exp > 0 ? `${whole}.${abs.slice(abs.length - exp)}` : whole;
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${number}` : `${number} ${currency}`;
}

/** A signed amount with its sign in words: "minus $640.00". */
export function formatSigned(minor: string | bigint, currency: string, exponents: Record<string, number>): string {
  const n = toBig(minor);
  return n < 0n ? `minus ${formatAmount(n, currency, exponents)}` : formatAmount(n, currency, exponents);
}

/** A cash movement: "$1,250.00 in", "$640.00 out" or "no cash movement". */
export function formatMovement(minor: string | bigint, currency: string, exponents: Record<string, number>): string {
  const n = toBig(minor);
  if (n === 0n) return "no cash movement";
  return `${formatAmount(n, currency, exponents)} ${n > 0n ? "in" : "out"}`;
}

/** Calendar dates in the house style: "4 Jan 2000". */
export const day = formatDay;

/** Cutoffs and publication times are shown in UTC, as sealed: "31 Mar 2000, 23:59 UTC". */
export const utcTime = (iso: string) => formatDateTime(iso, "UTC");
