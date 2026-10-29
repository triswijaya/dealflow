import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";

// §3 Organisasi / AUTH-05: a user has at most one ACTIVE membership but may keep
// older deactivated rows (the partial unique index in schema.ts). Every lookup by
// userId resolves "the" membership through here, so a leftover deactivated row in
// an old organization can never shadow the active one: active first, otherwise
// the most recent deactivated row.
export const currentMembershipOrder = [sql`${member.deactivatedAt} IS NOT NULL`, desc(member.createdAt)] as const;

export async function findCurrentMembership(userId: string) {
  const [row] = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(...currentMembershipOrder)
    .limit(1);
  return row;
}

export async function findActiveMembership(userId: string) {
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), isNull(member.deactivatedAt)))
    .limit(1);
  return row;
}
