import { MAX_MONEY_AMOUNT } from "./amount";
import { MAX_QUANTITY_SCALED, QUANTITY_SCALE } from "./quantity";

// MONEY-03: the version of the calculation rules baked into a snapshot.
// MONEY-07 forbids recalculating a frozen snapshot with a new formula
// without an explicit migration, so the version travels with the stored
// document and is not inferred at read time.
export const CALCULATION_VERSION = 1;

export type CalculationErrorCode =
  | "NO_ITEMS"
  | "AMOUNT_OUT_OF_RANGE"
  | "DISCOUNT_EXCEEDS_SUBTOTAL"
  | "TOTAL_NOT_POSITIVE";

export type DocumentTotals = {
  itemSubtotals: bigint[];
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
  calculationVersion: typeof CALCULATION_VERSION;
};

export type CalculationResult = { ok: true; totals: DocumentTotals } | { ok: false; code: CalculationErrorCode };

export type CalculationLine = {
  quantityScaled: bigint;
  unitPrice: bigint;
};

/**
 * MONEY-02/MONEY-03: HALF_UP(q_scaled * unit_price / 1000), rounded once,
 * here, per line.
 *
 * Both operands are non-negative, so the product is non-negative and
 * BigInt's truncating division makes `(product + half) / scale` exactly
 * HALF_UP. That identity is the reason for the guard below rather than a
 * bare type annotation: a negative operand would round the wrong way and
 * still return a plausible-looking number.
 */
export function calculateItemSubtotal(quantityScaled: bigint, unitPrice: bigint): bigint {
  if (quantityScaled < 0n || unitPrice < 0n) {
    throw new Error("calculateItemSubtotal requires non-negative inputs");
  }
  return (quantityScaled * unitPrice + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
}

/**
 * MONEY-03: document_subtotal sums the already-rounded line subtotals. It
 * does not re-derive a combined quantity, which would round differently:
 * two lines of 0.333 x Rp1.001 are Rp666, not the Rp667 that 0.666 x
 * Rp1.001 would give.
 *
 * MONEY-04/MONEY-05 bounds are checked after the BigInt arithmetic, as the
 * requirement specifies ("hitung dengan BigInt lebih dahulu lalu tolak jika
 * hasil melewati batas"), so an overflowing intermediate is caught rather
 * than wrapping.
 *
 * Returns a result union instead of throwing an APIError: this module is
 * pure domain code with no dependency on the auth layer, following the same
 * split as customers/phone.ts, where the service translates a domain
 * failure into the transport error.
 */
export function calculateDocumentTotals(input: {
  items: readonly CalculationLine[];
  discount: bigint;
  tax: bigint;
}): CalculationResult {
  if (input.items.length === 0) {
    return { ok: false, code: "NO_ITEMS" };
  }
  // MONEY-05: discount and tax are document-level nominal amounts, never
  // percentages, and neither may be negative. MONEY-04: both are still
  // "amount" values, bounded by the same ceiling as any other money field.
  if (input.discount < 0n || input.tax < 0n || input.discount > MAX_MONEY_AMOUNT || input.tax > MAX_MONEY_AMOUNT) {
    return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
  }

  const itemSubtotals: bigint[] = [];
  let subtotal = 0n;
  for (const item of input.items) {
    if (item.quantityScaled < 0n || item.unitPrice < 0n) {
      return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
    }
    // MONEY-04: the Zod schemas already enforce these upper bounds on the
    // create/update quotation request path, but this helper is the one
    // MONEY-07 designates as shared with invoice (M3) and tests, so the
    // bound belongs here too -- a caller that reaches this function
    // through anything other than that Zod path must not slip through.
    if (item.quantityScaled > MAX_QUANTITY_SCALED || item.unitPrice > MAX_MONEY_AMOUNT) {
      return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
    }
    const itemSubtotal = calculateItemSubtotal(item.quantityScaled, item.unitPrice);
    if (itemSubtotal > MAX_MONEY_AMOUNT) {
      return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
    }
    itemSubtotals.push(itemSubtotal);
    subtotal += itemSubtotal;
  }
  if (subtotal > MAX_MONEY_AMOUNT) {
    return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
  }

  // MONEY-05: 0 <= discount <= subtotal.
  if (input.discount > subtotal) {
    return { ok: false, code: "DISCOUNT_EXCEEDS_SUBTOTAL" };
  }

  const total = subtotal - input.discount + input.tax;
  if (total > MAX_MONEY_AMOUNT) {
    return { ok: false, code: "AMOUNT_OUT_OF_RANGE" };
  }
  // MONEY-05: a stored quotation/invoice must have total > 0. A free line
  // is fine as long as the document as a whole is positive, so this is a
  // document-level check, not a per-item one. total can never be negative
  // here (discount <= subtotal and tax >= 0), so this only fires on zero.
  if (total <= 0n) {
    return { ok: false, code: "TOTAL_NOT_POSITIVE" };
  }

  return {
    ok: true,
    totals: {
      itemSubtotals,
      subtotal,
      discount: input.discount,
      tax: input.tax,
      total,
      calculationVersion: CALCULATION_VERSION,
    },
  };
}
