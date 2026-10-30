import { and, eq, isNull } from "drizzle-orm";
import { computeWorkQueues } from "@/server/collections/collections";
import { db } from "@/server/db/client";
import { member, organization, user } from "@/server/db/schema";
import { formatRupiah } from "@/server/money/amount";
import { organizationClock } from "@/server/shared/organization-clock";
import { DAILY_SUMMARY_EMAIL } from "./handlers";
import { enqueueOutbox } from "./outbox";

/**
 * ADR-0004: one mail a day to each active Owner and Admin with what needs doing,
 * from the same work queues the app shows. An organization with nothing to do gets
 * no mail. The dedupe key holds the organization's date and the recipient, so
 * running the cron twice in a day (or retrying it) mails nobody twice.
 */
export async function enqueueDailySummaries(): Promise<{ organizations: number; enqueued: number }> {
  const organizations = await db.select({ id: organization.id, name: organization.name }).from(organization);
  let enqueued = 0;

  for (const org of organizations) {
    const { today } = await organizationClock(org.id);
    const recipients = await db
      .select({ userId: user.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, org.id), isNull(member.deactivatedAt)));
    const owners = recipients.filter((recipient) => recipient.role === "OWNER" || recipient.role === "ADMIN");
    if (owners.length === 0) continue;

    const queues = await computeWorkQueues(org.id, "OWNER");
    const lines = [
      queues.readyToBill && queues.readyToBill.count > 0 ? `- ${queues.readyToBill.count} termin siap ditagih (${formatRupiah(BigInt(queues.readyToBill.total))})` : null,
      queues.collection && queues.collection.count > 0 ? `- ${queues.collection.count} invoice perlu ditagih (terlambat, segera jatuh tempo, atau janji bayar terlewat)` : null,
      queues.unallocatedMoney && queues.unallocatedMoney.count > 0 ? `- ${queues.unallocatedMoney.count} penerimaan uang belum dialokasikan (${formatRupiah(BigInt(queues.unallocatedMoney.total))})` : null,
      queues.reviewDue && queues.reviewDue.count > 0 ? `- ${queues.reviewDue.count} deal ditahan yang waktunya ditinjau ulang` : null,
    ].filter((line): line is string => line !== null);
    if (lines.length === 0) continue;

    for (const recipient of owners) {
      const id = await db.transaction((tx) =>
        enqueueOutbox(tx, {
          organizationId: org.id,
          type: DAILY_SUMMARY_EMAIL,
          dedupeKey: `daily-summary:${today}:${recipient.userId}`,
          payload: {
            to: recipient.email,
            subject: `Ringkasan harian ${org.name}, ${today}`,
            text: [`Halo ${recipient.name},`, "", "Yang perlu ditangani hari ini:", ...lines, "", "Buka DealFlow untuk melihat daftarnya."].join("\n"),
          },
        }),
      );
      if (id) enqueued += 1;
    }
  }
  return { organizations: organizations.length, enqueued };
}
