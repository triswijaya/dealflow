import { invoiceItems, invoices } from "@/server/db/schema";
import type { CustomerSnapshot, SellerSnapshot } from "@/server/shared/document-snapshot-types";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { invoiceEffectiveStatus, invoiceRemainingAmount } from "./effective-status";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceItemRow = typeof invoiceItems.$inferSelect;
/** A payment is a receipt together with its settlement on the invoice (PAY-01); this is the flat shape screens read. */
export type PaymentRow = {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: bigint;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  note: string | null;
  createdAt: Date;
  createdById: string;
};

export type InvoiceItemDto = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
  sortOrder: number;
};

// §10.1/§10.2/§14.1: explicit field-by-field mapping, never a spread.
// paid_amount/remaining_amount/status are all derived (never stored,
// never client input), computed here from the caller's already-summed
// paidAmount rather than a cached column -- the same rule withBalance
// used to enforce inline before this mapper replaced it.
export type InvoiceDto = {
  id: string;
  organizationId: string;
  dealId: string | null;
  orderId: string;
  billingItemId: string;
  customerId: string;
  invoiceNumber: string;
  quotationId: string | null;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  status: string;
  voidedAt: string | null;
  voidReason: string | null;
  replacesInvoiceId: string | null;
  paidAmount: string;
  remainingAmount: string;
  sellerSnapshot: SellerSnapshot | null;
  customerSnapshot: CustomerSnapshot | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  items: InvoiceItemDto[];
};

export type PaymentDto = {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  createdById: string;
};

// API-01's contract for recordPayment: "payment + latest invoice balance"
// in one response, so the caller never has to re-fetch the invoice to show
// a confirmation screen. Distinct from InvoiceDto -- it is not the full
// invoice, just the fields that response needs.
export type PaymentResultDto = {
  payment: PaymentDto;
  invoiceId: string;
  invoiceNumber: string;
  total: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
};

function toInvoiceItemDto(row: InvoiceItemRow): InvoiceItemDto {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: toMoneyDto(row.unitPrice),
    subtotal: toMoneyDto(row.subtotal),
    sortOrder: row.sortOrder,
  };
}

// calculationVersion is deliberately excluded, same reasoning as
// quotations: MONEY-03/07's internal formula-version guard, never read by
// any client.
export function toInvoiceDto(row: InvoiceRow, items: InvoiceItemRow[], paidAmount: bigint, todayOrg: string): InvoiceDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    orderId: row.orderId,
    billingItemId: row.billingItemId,
    customerId: row.customerId,
    invoiceNumber: row.invoiceNumber,
    quotationId: row.quotationId,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    subtotal: toMoneyDto(row.subtotal),
    discount: toMoneyDto(row.discount),
    tax: toMoneyDto(row.tax),
    total: toMoneyDto(row.total),
    currency: row.currency,
    notes: row.notes,
    terms: row.terms,
    status: invoiceEffectiveStatus({ total: row.total, paidAmount, dueDate: row.dueDate, voided: row.voidedAt !== null }, todayOrg),
    voidedAt: row.voidedAt ? toIsoDto(row.voidedAt) : null,
    voidReason: row.voidReason,
    replacesInvoiceId: row.replacesInvoiceId,
    paidAmount: toMoneyDto(paidAmount),
    remainingAmount: toMoneyDto(invoiceRemainingAmount(row.total, paidAmount, row.voidedAt !== null)),
    sellerSnapshot: row.sellerSnapshot,
    customerSnapshot: row.customerSnapshot,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    items: items.map(toInvoiceItemDto),
  };
}

export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    invoiceId: row.invoiceId,
    amount: toMoneyDto(row.amount),
    paymentDate: row.paymentDate,
    paymentMethod: row.paymentMethod,
    reference: row.reference,
    note: row.note,
    createdAt: toIsoDto(row.createdAt),
    createdById: row.createdById,
  };
}

export function toPaymentResultDto(
  payment: PaymentRow,
  invoice: InvoiceRow,
  paidAmount: bigint,
  todayOrg: string,
): PaymentResultDto {
  return {
    payment: toPaymentDto(payment),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    total: toMoneyDto(invoice.total),
    paidAmount: toMoneyDto(paidAmount),
    remainingAmount: toMoneyDto(invoiceRemainingAmount(invoice.total, paidAmount, invoice.voidedAt !== null)),
    status: invoiceEffectiveStatus({ total: invoice.total, paidAmount, dueDate: invoice.dueDate, voided: invoice.voidedAt !== null }, todayOrg),
  };
}
