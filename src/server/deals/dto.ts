import { deals } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";

type DealRow = typeof deals.$inferSelect;

export type DealDto = {
  id: string;
  organizationId: string;
  customerId: string;
  contactId: string | null;
  title: string;
  description: string;
  notes: string | null;
  estimatedValue: string;
  status: string;
  assignedToId: string;
  expectedCloseDate: string | null;
  lostReason: string | null;
  lostNote: string | null;
  wonAt: string | null;
  wonValue: string | null;
  lostAt: string | null;
  lastActivityAt: string;
  onHoldUntil: string | null;
  onHoldReason: string | null;
  hasQuotation: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string | null;
};

// DEAL-01-07/§14.1: explicit field-by-field mapping, never a spread. Two
// bigint fields here (estimatedValue, wonValue) -- both are what MONEY-01
// requires this layer to guard against leaking raw onto the wire.
export function toDealDto(row: DealRow): DealDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    contactId: row.contactId,
    title: row.title,
    description: row.description,
    notes: row.notes,
    estimatedValue: toMoneyDto(row.estimatedValue),
    status: row.status,
    assignedToId: row.assignedToId,
    expectedCloseDate: row.expectedCloseDate,
    lostReason: row.lostReason,
    lostNote: row.lostNote,
    wonAt: row.wonAt ? toIsoDto(row.wonAt) : null,
    wonValue: row.wonValue !== null ? toMoneyDto(row.wonValue) : null,
    lostAt: row.lostAt ? toIsoDto(row.lostAt) : null,
    lastActivityAt: toIsoDto(row.lastActivityAt),
    onHoldUntil: row.onHoldUntil,
    onHoldReason: row.onHoldReason,
    hasQuotation: row.hasQuotation,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    updatedById: row.updatedById,
  };
}
