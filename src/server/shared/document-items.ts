import { z } from "zod";
import { moneyAmountSchema } from "@/server/money/amount";
import { quantitySchema } from "@/server/money/quantity";

// QUO-02/API-04: MVP item-count ceiling, shared by quotation and invoice.
export const MAX_DOCUMENT_ITEMS = 200;

/**
 * QUO-02's line-item field contract. Shared rather than duplicated per
 * module because INV-02 requires invoice items to have the same
 * "field/precision sama dengan quotation items" -- two independent copies
 * could drift apart, which would be a contract violation rather than just
 * an inconsistency.
 */
export const documentItemSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  quantity: quantitySchema,
  unit: z.string().trim().min(1).max(50),
  unitPrice: moneyAmountSchema,
});

// discount/tax are optional nominal amounts (MONEY-03), defaulting to "0"
// before moneyAmountSchema ever sees them, so an omitted field and an
// explicit "0" behave identically.
export const optionalMoneyAmountSchema = z.string().default("0").pipe(moneyAmountSchema);
