import { sql } from "drizzle-orm";
import type { db as Database } from "@/server/db/client";
import { documentCounters } from "@/server/db/schema";

// QUO-04: minimum five digits, widening (never rolling over or duplicating)
// past 99999.
const MIN_SEQUENCE_DIGITS = 5;

/**
 * Atomically claims the next sequence number for (organizationId,
 * documentType, year) and returns it. A single UPSERT: on first use for
 * that key it inserts nextSequence = 2 and returns 1; on every use after
 * that it increments the existing row and returns the value the row held
 * before the increment. Either way, the value returned is claimed by this
 * call alone, because Postgres's ON CONFLICT DO UPDATE takes a row lock
 * for the duration of the statement, so two concurrent callers in the same
 * transaction-free race still serialize on that row rather than racing to
 * read-then-write.
 *
 * Must be called inside the same db.transaction() as the row that consumes
 * the number (DATA-06: "document numbering+create" is one of the
 * transactions the requirement names explicitly). If that transaction rolls
 * back, the claimed number is not reused (DATA-02: "Nomor yang sudah
 * dipakai tidak digunakan ulang; gaps diperbolehkan"), which is why this
 * function never needs to "give a number back."
 */
export async function claimNextSequence(
  tx: Parameters<Parameters<typeof Database.transaction>[0]>[0],
  params: { organizationId: string; documentType: string; year: number },
): Promise<number> {
  const [row] = await tx
    .insert(documentCounters)
    .values({
      organizationId: params.organizationId,
      documentType: params.documentType,
      year: params.year,
      nextSequence: 2,
    })
    .onConflictDoUpdate({
      target: [documentCounters.organizationId, documentCounters.documentType, documentCounters.year],
      set: { nextSequence: sql`${documentCounters.nextSequence} + 1` },
    })
    .returning({ claimed: sql<number>`${documentCounters.nextSequence} - 1` });

  return row.claimed;
}

/** QUO-04: `QT-2026-00042`. Padded to 5 digits, then simply widens past it. */
export function formatQuotationNumber(year: number, sequence: number): string {
  return `QT-${year}-${sequence.toString().padStart(MIN_SEQUENCE_DIGITS, "0")}`;
}

/**
 * QUO-04: `QT-2026-00042-R1`, then `-R2`. `baseNumber` must always be the
 * family's original quotation's number (the row where revisionNumber = 1),
 * never the immediate source's own number -- a revision made from an
 * already-revised version stays "-R2", it does not stack into "-R1-R2".
 */
export function formatRevisionNumber(baseNumber: string, revisionNumber: number): string {
  return `${baseNumber}-R${revisionNumber}`;
}
