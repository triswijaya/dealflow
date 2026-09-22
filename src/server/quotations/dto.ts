import type { CustomerSnapshot, SellerSnapshot } from "@/server/shared/document-snapshot-types";
import { quotationItems, quotations } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { effectiveQuotationStatus } from "./effective-status";

type QuotationRow = typeof quotations.$inferSelect;
type QuotationItemRow = typeof quotationItems.$inferSelect;

export type QuotationItemDto = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
  sortOrder: number;
};

// QUO-01-10/§14.1: every field except items. listQuotations (a summary
// view -- QUO-06's revision comparison only ever needs number/date/total,
// not line items) and transitionQuotationStatus (whose current query
// shape never fetches items) both return this narrower shape; getQuotation
// and every mutation that already has the items in hand return the full
// QuotationDto below instead of re-querying just to satisfy one shared type.
export type QuotationSummaryDto = {
  id: string;
  organizationId: string;
  dealId: string;
  customerId: string;
  quotationNumber: string;
  familyId: string;
  revisionNumber: number;
  previousRevisionId: string | null;
  isLatest: boolean;
  issueDate: string;
  validUntil: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  terms: string | null;
  // QUO-10: the effective status (SENT past validUntil displays as
  // EXPIRED), never the raw stored column -- computed here so no caller
  // can accidentally leak the raw value instead.
  status: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedById: string | null;
  rejectedAt: string | null;
  rejectedById: string | null;
  frozenAt: string | null;
  sellerSnapshot: SellerSnapshot | null;
  customerSnapshot: CustomerSnapshot | null;
  editVersion: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string | null;
};

export type QuotationDto = QuotationSummaryDto & { items: QuotationItemDto[] };

// calculationVersion is deliberately excluded: MONEY-03/07's internal
// formula-version guard, never read or acted on by any client.
export function toQuotationSummaryDto(row: QuotationRow, todayOrg: string): QuotationSummaryDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    customerId: row.customerId,
    quotationNumber: row.quotationNumber,
    familyId: row.familyId,
    revisionNumber: row.revisionNumber,
    previousRevisionId: row.previousRevisionId,
    isLatest: row.isLatest,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    subtotal: toMoneyDto(row.subtotal),
    discount: toMoneyDto(row.discount),
    tax: toMoneyDto(row.tax),
    total: toMoneyDto(row.total),
    notes: row.notes,
    terms: row.terms,
    status: effectiveQuotationStatus(row, todayOrg),
    sentAt: row.sentAt ? toIsoDto(row.sentAt) : null,
    acceptedAt: row.acceptedAt ? toIsoDto(row.acceptedAt) : null,
    acceptedById: row.acceptedById,
    rejectedAt: row.rejectedAt ? toIsoDto(row.rejectedAt) : null,
    rejectedById: row.rejectedById,
    frozenAt: row.frozenAt ? toIsoDto(row.frozenAt) : null,
    sellerSnapshot: row.sellerSnapshot,
    customerSnapshot: row.customerSnapshot,
    editVersion: row.editVersion,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    updatedById: row.updatedById,
  };
}

function toQuotationItemDto(row: QuotationItemRow): QuotationItemDto {
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

export function toQuotationDto(row: QuotationRow, items: QuotationItemRow[], todayOrg: string): QuotationDto {
  return { ...toQuotationSummaryDto(row, todayOrg), items: items.map(toQuotationItemDto) };
}
