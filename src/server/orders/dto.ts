import { billingItems, orderAmendments, orders } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import type { BillingItemStatus, OrderStatus } from "./billing";

export type BillingItemDto = {
  id: string;
  orderId: string;
  label: string;
  amount: string;
  trigger: string;
  dueOn: string | null;
  isRetention: boolean;
  milestoneDoneAt: string | null;
  milestoneRef: string | null;
  status: BillingItemStatus;
  /** The live (non-void) invoice of the item, when there is one. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  sortOrder: number;
};

export type AmendmentDto = {
  id: string;
  delta: string;
  reason: string;
  reference: string | null;
  effectiveDate: string;
  createdAt: string;
};

export type OrderDto = {
  id: string;
  orderNumber: string;
  customerId: string;
  dealId: string | null;
  contactId: string | null;
  title: string;
  scope: string | null;
  commitmentType: string;
  commitmentRef: string | null;
  commitmentDate: string;
  originalValue: string;
  /** Original value plus the amendments (ORD-03). */
  currentValue: string;
  /** Sum of the live invoices. */
  billedAmount: string;
  status: OrderStatus;
  sourceQuotationId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  version: number;
  createdAt: string;
  billingItems: BillingItemDto[];
  amendments: AmendmentDto[];
};

export type LiveInvoiceFacts = { id: string; invoiceNumber: string; billingItemId: string; total: bigint; settled: bigint };

export function toBillingItemDto(row: typeof billingItems.$inferSelect, status: BillingItemStatus, invoice: LiveInvoiceFacts | undefined): BillingItemDto {
  return {
    id: row.id,
    orderId: row.orderId,
    label: row.label,
    amount: toMoneyDto(row.amount),
    trigger: row.trigger,
    dueOn: row.dueOn,
    isRetention: row.isRetention,
    milestoneDoneAt: row.milestoneDoneAt ? toIsoDto(row.milestoneDoneAt) : null,
    milestoneRef: row.milestoneRef,
    status,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    sortOrder: row.sortOrder,
  };
}

export function toAmendmentDto(row: typeof orderAmendments.$inferSelect): AmendmentDto {
  return {
    id: row.id,
    delta: row.delta.toString(),
    reason: row.reason,
    reference: row.reference,
    effectiveDate: row.effectiveDate,
    createdAt: toIsoDto(row.createdAt),
  };
}

export function toOrderDto(
  row: typeof orders.$inferSelect,
  parts: { currentValue: bigint; billedAmount: bigint; status: OrderStatus; items: BillingItemDto[]; amendments: AmendmentDto[] },
): OrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    dealId: row.dealId,
    contactId: row.contactId,
    title: row.title,
    scope: row.scope,
    commitmentType: row.commitmentType,
    commitmentRef: row.commitmentRef,
    commitmentDate: row.commitmentDate,
    originalValue: toMoneyDto(row.originalValue),
    currentValue: toMoneyDto(parts.currentValue),
    billedAmount: toMoneyDto(parts.billedAmount),
    status: parts.status,
    sourceQuotationId: row.sourceQuotationId,
    cancelledAt: row.cancelledAt ? toIsoDto(row.cancelledAt) : null,
    cancelReason: row.cancelReason,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    billingItems: parts.items,
    amendments: parts.amendments,
  };
}
