import { z } from "zod";

// MONEY-01: rupiah as PostgreSQL bigint / TypeScript bigint end to end,
// never JS floating point. On the wire (JSON/DTO), an amount is a string
// integer, e.g. "12500000", not a number.
// MONEY-04: 0 <= amount <= Rp 1.000.000.000.000.000 per record.
// MONEY-07: this helper is meant to be shared by quotation, invoice, and
// payment once those exist, not re-implemented per module.
export const MAX_MONEY_AMOUNT = 1_000_000_000_000_000n;

// MONEY-05: negative, decimal, exponent notation, NaN, and Infinity are all
// rejected by construction here (the regex only ever matches plain digits),
// not by parsing loosely and then checking after the fact.
export const moneyAmountSchema = z
  .string()
  .regex(/^[0-9]+$/, "Amount must be a non-negative integer string")
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_MONEY_AMOUNT, {
    message: `Amount exceeds the maximum of ${MAX_MONEY_AMOUNT.toString()}`,
  });

// UX-05: "Angka uang ditampilkan Rp30.000.000" -- the human-display mirror
// of moneyAmountSchema's parse direction. Period as the thousands
// separator, no decimals (rupiah amounts are always whole, MONEY-01), and
// never routes through Number, so it stays exact at any magnitude
// moneyAmountSchema itself allows.
export function formatRupiah(amount: bigint): string {
  const isNegative = amount < 0n;
  const digits = (isNegative ? -amount : amount).toString();
  const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp${isNegative ? "-" : ""}${withSeparators}`;
}
