import { receipts } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";

export type ReceiptStatus = "ACTIVE" | "REVERSED";

export type ReceiptDto = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  amount: string;
  receivedOn: string;
  method: string;
  reference: string | null;
  note: string | null;
  /** Allocated to invoices (active RECEIPT settlements). */
  allocatedAmount: string;
  refundedAmount: string;
  /** What is left: amount minus allocated minus refunded, and 0 for a reversed receipt (RCP-05). */
  availableAmount: string;
  status: ReceiptStatus;
  identifiedAt: string | null;
  identificationNote: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
};

export function toReceiptDto(
  row: typeof receipts.$inferSelect,
  parts: { customerName: string | null; allocated: bigint; refunded: bigint },
): ReceiptDto {
  const reversed = row.reversedAt !== null;
  const left = row.amount - parts.allocated - parts.refunded;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: parts.customerName,
    amount: toMoneyDto(row.amount),
    receivedOn: row.receivedOn,
    method: row.method,
    reference: row.reference,
    note: row.note,
    allocatedAmount: toMoneyDto(parts.allocated),
    refundedAmount: toMoneyDto(parts.refunded),
    availableAmount: toMoneyDto(reversed || left < 0n ? 0n : left),
    status: reversed ? "REVERSED" : "ACTIVE",
    identifiedAt: row.identifiedAt ? toIsoDto(row.identifiedAt) : null,
    identificationNote: row.identificationNote,
    reversedAt: row.reversedAt ? toIsoDto(row.reversedAt) : null,
    reversalReason: row.reversalReason,
    createdAt: toIsoDto(row.createdAt),
  };
}
