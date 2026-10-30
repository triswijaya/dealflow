import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { outboxEvents } from "@/server/db/schema";
import { EmailDeliveryError } from "@/server/email/send-email";
import { logger } from "@/server/shared/logger";
import { toIsoDto } from "@/server/shared/dto";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OutboxRow = typeof outboxEvents.$inferSelect;

// ADR-0004: a side effect is a row written in the same transaction as the business
// change. It is tried right after commit and swept later by a cron if that failed.
// A row is attempted at most MAX_ATTEMPTS times, with a growing wait, then DEAD.

export const MAX_ATTEMPTS = 6;
const LOCK_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 6 * 3_600_000;

/** Waits 1, 2, 4, ... minutes after the 1st, 2nd, 3rd... failure, never more than six hours. */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export type OutboxHandler = (event: OutboxRow) => Promise<void>;
const handlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(type: string, handler: OutboxHandler) {
  handlers.set(type, handler);
}

/**
 * Writes the row inside the caller's transaction. A dedupe key already used by
 * this organization makes the call a no-op and returns null, so a repeated trigger
 * (a double click, a re-run cron) never sends twice.
 */
export async function enqueueOutbox(
  tx: Tx,
  params: { organizationId: string; type: string; payload: Record<string, unknown>; dedupeKey: string; createdById?: string | null },
): Promise<string | null> {
  const [row] = await tx
    .insert(outboxEvents)
    .values({
      organizationId: params.organizationId,
      type: params.type,
      payload: params.payload,
      dedupeKey: params.dedupeKey,
      createdById: params.createdById ?? null,
    })
    .onConflictDoNothing({ target: [outboxEvents.organizationId, outboxEvents.dedupeKey] })
    .returning({ id: outboxEvents.id });
  return row?.id ?? null;
}

/** What to keep of a failure: a category and a short message, never the recipient, the text or a key. */
function describeFailure(error: unknown): string {
  if (error instanceof EmailDeliveryError) return error.category;
  return error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN";
}

function isRetryable(error: unknown): boolean {
  return error instanceof EmailDeliveryError ? error.retryable : true;
}

/**
 * Claims up to `limit` due rows in one statement (FOR UPDATE SKIP LOCKED, so two
 * sweeps never take the same row) and runs their handlers. A row that fails goes
 * back for a later try, or to DEAD when it ran out of attempts or the failure
 * cannot be fixed by waiting. Pass `ids` to try specific rows right after commit.
 */
export async function processOutbox(options: { limit?: number; ids?: string[]; now?: Date } = {}): Promise<{ claimed: number; sent: number; failed: number; dead: number }> {
  const limit = options.limit ?? 25;
  const idFilter = options.ids?.length ? sql`and id in (${sql.join(options.ids.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const claimed = await db.execute<{ id: string }>(sql`
    update outbox_events set locked_until = now() + ${`${LOCK_MS} milliseconds`}::interval, attempts = attempts + 1
    where id in (
      select id from outbox_events
      where status in ('PENDING', 'FAILED') and next_attempt_at <= now() and (locked_until is null or locked_until < now()) ${idFilter}
      order by next_attempt_at, id
      limit ${limit}
      for update skip locked
    )
    returning id`);
  const ids = claimed.map((row) => row.id);
  if (ids.length === 0) return { claimed: 0, sent: 0, failed: 0, dead: 0 };

  const rows = await db.select().from(outboxEvents).where(inArray(outboxEvents.id, ids)).orderBy(asc(outboxEvents.id));
  const result = { claimed: rows.length, sent: 0, failed: 0, dead: 0 };
  for (const row of rows) {
    const handler = handlers.get(row.type);
    try {
      if (!handler) throw new Error(`NoHandler`);
      await handler(row);
      await db.update(outboxEvents).set({ status: "SENT", sentAt: new Date(), lockedUntil: null, lastError: null }).where(eq(outboxEvents.id, row.id));
      result.sent += 1;
    } catch (error) {
      const dead = !isRetryable(error) || row.attempts >= MAX_ATTEMPTS || !handler;
      await db
        .update(outboxEvents)
        .set({
          status: dead ? "DEAD" : "FAILED",
          lockedUntil: null,
          lastError: describeFailure(error),
          nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
        })
        .where(eq(outboxEvents.id, row.id));
      logger.warn("outbox.failed", { type: row.type, attempts: row.attempts, dead, error });
      result[dead ? "dead" : "failed"] += 1;
    }
  }
  return result;
}

/** Best effort right after a commit: a failure is already recorded on the row, so it is never thrown at the caller. */
export async function tryOutboxNow(ids: (string | null)[]) {
  const present = ids.filter((id): id is string => id !== null);
  if (present.length === 0) return;
  try {
    await processOutbox({ ids: present });
  } catch (error) {
    logger.warn("outbox.immediate_failed", { error });
  }
}

export type OutboxEventDto = { id: string; type: string; status: string; attempts: number; lastError: string | null; nextAttemptAt: string; createdAt: string };

/** What the Owner or Admin can see of delivery: the rows that gave up, newest first (ADR-0004 operations). */
export async function listDeadOutboxEvents(params: { headers: Headers; limit?: number }): Promise<OutboxEventDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { organization: ["update"] } });
  const rows = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.organizationId, actor.organizationId), eq(outboxEvents.status, "DEAD")))
    .orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id))
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 200));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: toIsoDto(row.nextAttemptAt),
    createdAt: toIsoDto(row.createdAt),
  }));
}
