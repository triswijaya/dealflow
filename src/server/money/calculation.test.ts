import { describe, expect, it } from "vitest";
import { MAX_MONEY_AMOUNT } from "./amount";
import { CALCULATION_VERSION, calculateDocumentTotals, calculateItemSubtotal } from "./calculation";
import { MAX_QUANTITY_SCALED, quantitySchema } from "./quantity";

// Convenience so the tests read in the same units the requirement uses:
// a decimal quantity string plus a rupiah unit price.
function line(quantity: string, unitPrice: bigint) {
  return { quantityScaled: quantitySchema.parse(quantity), unitPrice };
}

function expectOk(result: ReturnType<typeof calculateDocumentTotals>) {
  if (!result.ok) {
    throw new Error(`expected a successful calculation, got ${result.code}`);
  }
  return result.totals;
}

describe("calculateItemSubtotal", () => {
  // The worked examples MONEY-03 states verbatim, asserted literally
  // because they are the contract for the rounding rule. Its third example
  // (two lines summing to Rp666) needs a whole document, so it sits in the
  // calculateDocumentTotals block below.
  it("rounds 0.333 x Rp1.001 to Rp333 (MONEY-03)", () => {
    expect(calculateItemSubtotal(quantitySchema.parse("0.333"), 1001n)).toBe(333n);
  });

  it("rounds 0.500 x Rp1 up to Rp1, HALF_UP not half-even (MONEY-03)", () => {
    expect(calculateItemSubtotal(quantitySchema.parse("0.500"), 1n)).toBe(1n);
  });

  it("rounds a remainder below half down", () => {
    // 0.001 x Rp1.499 = Rp1,499
    expect(calculateItemSubtotal(quantitySchema.parse("0.001"), 1499n)).toBe(1n);
  });

  it("rounds a remainder of exactly half up", () => {
    // 0.001 x Rp1.500 = Rp1,5
    expect(calculateItemSubtotal(quantitySchema.parse("0.001"), 1500n)).toBe(2n);
  });

  it("rounds a case a floating-point implementation gets wrong (MONEY-02)", () => {
    // The concrete reason the domain refuses parseFloat. 0.009 has no exact
    // binary representation, so the float product lands just under the half
    // boundary and rounds the wrong way. The second assertion pins that
    // failure so the comment cannot quietly go stale.
    expect(calculateItemSubtotal(quantitySchema.parse("0.009"), 1500n)).toBe(14n);
    expect(Math.round(parseFloat("0.009") * 1500)).toBe(13);
  });

  it("keeps the intermediate product exact beyond Number's safe range", () => {
    // 250000.000 x Rp3.000.000.007 multiplies out to 750_000_001_750_000_000
    // before the divide by 1000, well past Number.MAX_SAFE_INTEGER (about
    // 9.007e15), so the arithmetic has to happen in BigInt rather than
    // trusting Number to still be exact at that magnitude.
    const quantityScaled = quantitySchema.parse("250000.000");
    expect(quantityScaled * 3_000_000_007n).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(calculateItemSubtotal(quantityScaled, 3_000_000_007n)).toBe(750_000_001_750_000n);
  });

  it("handles a whole quantity with no rounding at all", () => {
    expect(calculateItemSubtotal(quantitySchema.parse("3"), 2_500_000n)).toBe(7_500_000n);
  });

  it("refuses negative inputs, where the HALF_UP identity would not hold", () => {
    expect(() => calculateItemSubtotal(-1000n, 5n)).toThrow();
    expect(() => calculateItemSubtotal(1000n, -5n)).toThrow();
  });
});

describe("calculateDocumentTotals", () => {
  it("sums line subtotals that were each rounded once (MONEY-03)", () => {
    // The requirement's own follow-up to the first example: two such lines
    // are Rp666, not the Rp667 that rounding a combined 0.666 would give.
    const totals = expectOk(
      calculateDocumentTotals({
        items: [line("0.333", 1001n), line("0.333", 1001n)],
        discount: 0n,
        tax: 0n,
      }),
    );
    expect(totals.itemSubtotals).toEqual([333n, 333n]);
    expect(totals.subtotal).toBe(666n);
    expect(calculateItemSubtotal(quantitySchema.parse("0.666"), 1001n)).toBe(667n);
  });

  it("applies discount and tax at the document level", () => {
    const totals = expectOk(
      calculateDocumentTotals({
        items: [line("2", 10_000_000n), line("1", 5_000_000n)],
        discount: 2_500_000n,
        tax: 1_000_000n,
      }),
    );
    expect(totals.subtotal).toBe(25_000_000n);
    expect(totals.total).toBe(23_500_000n);
  });

  it("reports the calculation version for the snapshot (MONEY-03)", () => {
    const totals = expectOk(calculateDocumentTotals({ items: [line("1", 100n)], discount: 0n, tax: 0n }));
    expect(totals.calculationVersion).toBe(CALCULATION_VERSION);
    expect(CALCULATION_VERSION).toBe(1);
  });

  it("allows a free line as long as the document total is positive (MONEY-05)", () => {
    const totals = expectOk(
      calculateDocumentTotals({
        items: [line("1", 0n), line("1", 500_000n)],
        discount: 0n,
        tax: 0n,
      }),
    );
    expect(totals.itemSubtotals).toEqual([0n, 500_000n]);
    expect(totals.total).toBe(500_000n);
  });

  it("accepts a discount equal to the subtotal only when tax keeps the total positive", () => {
    const totals = expectOk(
      calculateDocumentTotals({ items: [line("1", 100_000n)], discount: 100_000n, tax: 10_000n }),
    );
    expect(totals.total).toBe(10_000n);
  });

  it("rejects a document whose total lands on zero (MONEY-05)", () => {
    const result = calculateDocumentTotals({ items: [line("1", 100_000n)], discount: 100_000n, tax: 0n });
    expect(result).toEqual({ ok: false, code: "TOTAL_NOT_POSITIVE" });
  });

  it("rejects a document with no items at all (QUO-01)", () => {
    const result = calculateDocumentTotals({ items: [], discount: 0n, tax: 1_000n });
    expect(result).toEqual({ ok: false, code: "NO_ITEMS" });
  });

  it("rejects a discount larger than the subtotal (MONEY-05)", () => {
    const result = calculateDocumentTotals({ items: [line("1", 100_000n)], discount: 100_001n, tax: 0n });
    expect(result).toEqual({ ok: false, code: "DISCOUNT_EXCEEDS_SUBTOTAL" });
  });

  it("rejects a negative discount or tax (MONEY-05)", () => {
    expect(calculateDocumentTotals({ items: [line("1", 100n)], discount: -1n, tax: 0n })).toEqual({
      ok: false,
      code: "AMOUNT_OUT_OF_RANGE",
    });
    expect(calculateDocumentTotals({ items: [line("1", 100n)], discount: 0n, tax: -1n })).toEqual({
      ok: false,
      code: "AMOUNT_OUT_OF_RANGE",
    });
  });

  it("rejects a single line subtotal over the per-record maximum (MONEY-04)", () => {
    const result = calculateDocumentTotals({ items: [line("2", MAX_MONEY_AMOUNT)], discount: 0n, tax: 0n });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects a subtotal that only overflows once the lines are summed (MONEY-04)", () => {
    const half = MAX_MONEY_AMOUNT / 2n;
    const result = calculateDocumentTotals({
      items: [line("1", half), line("1", half), line("1", 1n)],
      discount: 0n,
      tax: 0n,
    });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects a total pushed over the maximum by tax (MONEY-04)", () => {
    const result = calculateDocumentTotals({ items: [line("1", MAX_MONEY_AMOUNT)], discount: 0n, tax: 1n });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("accepts a total sitting exactly on the maximum (MONEY-04)", () => {
    const totals = expectOk(
      calculateDocumentTotals({ items: [line("1", MAX_MONEY_AMOUNT)], discount: 0n, tax: 0n }),
    );
    expect(totals.total).toBe(MAX_MONEY_AMOUNT);
  });

  // The Zod schemas (quantitySchema/moneyAmountSchema) already enforce these
  // ceilings on the create/update quotation request path, so `line()`'s own
  // quantitySchema.parse can't construct an out-of-range input here -- these
  // bypass it with a raw bigint to prove the shared calculation helper
  // itself refuses the value too (MONEY-07: this helper is the one invoice
  // and tests share, not just the request-path schema).
  it("rejects a quantityScaled over MAX_QUANTITY_SCALED even when the resulting product stays small (MONEY-04)", () => {
    const result = calculateDocumentTotals({
      items: [{ quantityScaled: MAX_QUANTITY_SCALED + 1n, unitPrice: 1n }],
      discount: 0n,
      tax: 0n,
    });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects a unitPrice over MAX_MONEY_AMOUNT even when quantity is zero and the product stays small (MONEY-04)", () => {
    const result = calculateDocumentTotals({
      items: [{ quantityScaled: 0n, unitPrice: MAX_MONEY_AMOUNT + 1n }],
      discount: 0n,
      tax: 1n, // keep the document total positive (MONEY-05) so this fails on the bound, not TOTAL_NOT_POSITIVE
    });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects a discount over MAX_MONEY_AMOUNT (MONEY-04)", () => {
    const result = calculateDocumentTotals({
      items: [line("1", MAX_MONEY_AMOUNT)],
      discount: MAX_MONEY_AMOUNT + 1n,
      tax: 0n,
    });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects a tax over MAX_MONEY_AMOUNT (MONEY-04)", () => {
    const result = calculateDocumentTotals({
      items: [line("1", 1n)],
      discount: 0n,
      tax: MAX_MONEY_AMOUNT + 1n,
    });
    expect(result).toEqual({ ok: false, code: "AMOUNT_OUT_OF_RANGE" });
  });
});
