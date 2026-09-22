import { followUps } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";
import type { FollowUpBucket } from "./follow-up-bucket";

type FollowUpRow = typeof followUps.$inferSelect;

export type FollowUpDto = {
  id: string;
  organizationId: string;
  dealId: string;
  type: string;
  note: string | null;
  followUpAt: string;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string | null;
};

// FUP-01-05/§14.1: explicit field-by-field mapping, never a spread.
export function toFollowUpDto(row: FollowUpRow): FollowUpDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    type: row.type,
    note: row.note,
    followUpAt: toIsoDto(row.followUpAt),
    completedAt: row.completedAt ? toIsoDto(row.completedAt) : null,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    updatedById: row.updatedById,
  };
}

// FUP-03: listActiveFollowUps' dashboard-reminder shape -- the same DTO
// plus the read-time TODAY/OVERDUE/UPCOMING bucket, which is not a stored
// column. Spreading toFollowUpDto's own (already-converted, fully known)
// output here is not the raw-row anti-pattern this layer exists to close;
// only a spread of an untyped domain row is.
export type ActiveFollowUpDto = FollowUpDto & { bucket: FollowUpBucket };

export function toActiveFollowUpDto(row: FollowUpRow, bucket: FollowUpBucket): ActiveFollowUpDto {
  return { ...toFollowUpDto(row), bucket };
}
