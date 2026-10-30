import { desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { auditEvents, user } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";
import { redact } from "@/server/shared/logger";
import { buildPaginatedDto, resolvePagination, type PaginatedDto, type PaginationInput } from "@/server/shared/pagination";

// AUD-04: the organization-level audit trail. Business events of a deal live in
// `activities`; this records who changed the organization itself. Later phases
// add their own actions (reopen, void, reversal, refund, ...) to the same list.
export type AuditAction =
  | "organization.created"
  | "settings.updated"
  | "invitation.created"
  | "invitation.cancelled"
  | "member.joined"
  | "member.deactivated"
  | "member.reactivated"
  | "member.role_changed"
  | "invoice.voided"
  | "receipt.identified"
  | "receipt.reversed"
  | "settlement.reversed"
  | "settlement.written_off"
  | "refund.recorded";

export type AuditTargetType = "organization" | "organization_settings" | "invitation" | "member" | "invoice" | "receipt" | "settlement" | "refund";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type AuditEventInput = {
  organizationId: string;
  /** Null when the system acted. */
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  /** A summary of what changed, never a whole record: keys that look secret are redacted on the way in. */
  metadata?: Record<string, unknown>;
};

/**
 * Pass the transaction of the change being audited so both commit or neither
 * does (AUD-03). Callers that cannot share a transaction (Better Auth owns the
 * write) record right after it succeeds.
 */
export async function recordAudit(executor: Executor, event: AuditEventInput): Promise<void> {
  await executor.insert(auditEvents).values({
    organizationId: event.organizationId,
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    metadata: event.metadata ? redact(event.metadata) : null,
  });
}

export type AuditEventDto = {
  id: string;
  createdAt: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actor: { id: string; name: string } | null;
  metadata: unknown;
};

/** Owner/Admin only (§6.2): the same people who may change settings. */
export async function listAuditEvents(params: {
  headers: Headers;
  pagination?: PaginationInput;
}): Promise<PaginatedDto<AuditEventDto>> {
  const actor = await requirePermission({ headers: params.headers, permission: { organization: ["update"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params.pagination ?? {});
  const scope = eq(auditEvents.organizationId, actor.organizationId);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ event: auditEvents, actorName: user.name })
      .from(auditEvents)
      .leftJoin(user, eq(user.id, auditEvents.actorId))
      .where(scope)
      // id breaks ties so two events in the same instant keep a stable order.
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditEvents).where(scope),
  ]);

  const items: AuditEventDto[] = rows.map(({ event, actorName }) => ({
    id: event.id,
    createdAt: toIsoDto(event.createdAt),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    actor: event.actorId && actorName ? { id: event.actorId, name: actorName } : null,
    metadata: event.metadata,
  }));
  return buildPaginatedDto(items, page, pageSize, total);
}
