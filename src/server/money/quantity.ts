import { z } from "zod";

// MONEY-02: quantity is numeric(12,3) in PostgreSQL and a decimal string in
// the contract. The domain works on an exact integer scaled by 1000, never
// on a JavaScript float. Concretely: 0.009 has no exact binary
// representation, so parseFloat("0.009") * 1500 is 13.499999999999998 and
// rounds to Rp13, where the exact product Rp13,5 must round to Rp14. That
// case is pinned in calculation.test.ts.
//
// Parsing is pure string manipulation (split on the dot, pad the fraction,
// concatenate) so no value ever passes through Number on its way in or out.
export const QUANTITY_DECIMALS = 3;
export const QUANTITY_SCALE = 1000n;

// MONEY-04: 0 < q <= 1.000.000,000. Expressed scaled, so the bound is
// checked in the same units the domain actually uses.
export const MAX_QUANTITY_SCALED = 1_000_000_000n;

// MONEY-02/MONEY-05: the regex is the whole rejection story for shape.
// More than three decimals is refused outright rather than silently
// truncated, and negatives, exponent notation, NaN, Infinity, a bare ".5"
// and a trailing "1." simply never match. Surrounding whitespace is not
// trimmed, matching moneyAmountSchema: a numeric contract value arrives
// clean or not at all.
export const quantitySchema = z
  .string()
  .regex(/^[0-9]+(\.[0-9]{1,3})?$/, "Quantity must be a decimal with at most 3 places")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(QUANTITY_DECIMALS, "0"));
  })
  .refine((scaled) => scaled > 0n, { message: "Quantity must be greater than zero" })
  .refine((scaled) => scaled <= MAX_QUANTITY_SCALED, {
    message: "Quantity exceeds the maximum of 1000000.000",
  });

/**
 * Renders a scaled quantity back to the decimal string that the
 * numeric(12,3) column stores, again without going through Number.
 */
export function formatQuantityScaled(scaled: bigint): string {
  if (scaled < 0n) {
    throw new Error("formatQuantityScaled requires a non-negative quantity");
  }
  const whole = scaled / QUANTITY_SCALE;
  const fraction = scaled % QUANTITY_SCALE;
  return `${whole}.${fraction.toString().padStart(QUANTITY_DECIMALS, "0")}`;
}
