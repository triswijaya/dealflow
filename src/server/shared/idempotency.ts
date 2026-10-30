import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import type { db } from "@/server/db/client";
import { idempotencyRecords } from "@/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * API-05 / PAY-04: claims an idempotency key for one operation, inside the
 * caller's transaction. A new key returns `{ replay: null }` and the caller goes
 * on. A key seen before returns the id of the entity the first call produced
 * (so the caller can answer with it), unless it was used with different content,
 * which is a client bug and a CONFLICT.
 */
export async function claimIdempotencyKey(
  tx: Tx,
  params: { organizationId: string; operation: string; key: string; fingerprint: string; resultEntityId: string },
): Promise<{ replay: null } | { replay: { resultEntityId: string } }> {
  const [claimed] = await tx
    .insert(idempotencyRecords)
    .values({
      organizationId: params.organizationId,
      operationType: params.operation,
      idempotencyKey: params.key,
      payloadFingerprint: params.fingerprint,
      resultEntityId: params.resultEntityId,
    })
    .onConflictDoNothing({ target: [idempotencyRecords.organizationId, idempotencyRecords.operationType, idempotencyRecords.idempotencyKey] })
    .returning();
  if (claimed) return { replay: null };

  const existing = await tx.query.idempotencyRecords.findFirst({
    where: and(
      eq(idempotencyRecords.organizationId, params.organizationId),
      eq(idempotencyRecords.operationType, params.operation),
      eq(idempotencyRecords.idempotencyKey, params.key),
    ),
  });
  if (existing!.payloadFingerprint !== params.fingerprint) {
    throw new APIError("CONFLICT", { message: "Idempotency key was already used with a different request" });
  }
  return { replay: { resultEntityId: existing!.resultEntityId } };
}
