import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { createFollowUp } from "@/server/follow-ups/follow-ups";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createDeal, putDealOnHold, transitionDeal } from "./deals";
import { getDealDetail, getPipelineBoard, listDealsNeedingAttention } from "./deal-views";

describe("deal health signals (DEAL-09)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
  const daysAhead = (days: number) => new Date(Date.now() + days * 86_400_000);

  async function dealIn(org: TestOrg, overrides: Record<string, unknown> = {}) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: `PT ${Math.random()}`, contactPerson: "Budi", phone: "08123456789" } });
    return createDeal({
      headers: org.ownerHeaders,
      input: { customerId: customer.id, title: "CCTV", estimatedValue: "10000000", assignedToId: org.ownerUserId, ...overrides },
    });
  }
  const task = (org: TestOrg, dealId: string, followUpAt: Date) =>
    createFollowUp({ headers: org.ownerHeaders, input: { dealId, type: "CALL", followUpAt: followUpAt.toISOString() } });
  const signalsOf = async (org: TestOrg, dealId: string) => (await getDealDetail({ headers: org.ownerHeaders, dealId })).signals;

  it("flags a new deal with no task, and clears the flag when a future task exists", async () => {
    const org = await setupOrganization();
    const created = await dealIn(org);
    expect(await signalsOf(org, created.id)).toEqual(["NO_NEXT_STEP"]);

    await task(org, created.id, daysAhead(3));
    expect(await signalsOf(org, created.id)).toEqual([]);
  });

  it("flags an overdue task but not NO_NEXT_STEP, since the task exists", async () => {
    const org = await setupOrganization();
    const created = await dealIn(org);
    await task(org, created.id, daysAgo(2));
    expect(await signalsOf(org, created.id)).toEqual(["TASK_OVERDUE"]);
  });

  it("flags a stale stage and a close date in the past, using the organization's calendar", async () => {
    const org = await setupOrganization();
    const created = await dealIn(org, { stage: "NEGOTIATION" });
    await task(org, created.id, daysAhead(2));
    expect(await signalsOf(org, created.id)).toEqual([]);

    await db.update(deals).set({ stageEnteredAt: daysAgo(22), expectedCloseDate: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) }).where(eq(deals.id, created.id));
    expect(await signalsOf(org, created.id)).toEqual(["STALE", "PAST_CLOSE_DATE"]);
  });

  it("gives a deal on hold only the review signal, from its review date", async () => {
    const org = await setupOrganization();
    const created = await dealIn(org);
    const held = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: new Date().toISOString().slice(0, 10) } });
    expect(held.onHoldUntil).not.toBeNull();
    // Review date today (in Jakarta or UTC, whichever is later) is due; no task is not a signal while parked.
    await db.update(deals).set({ onHoldUntil: "2020-01-01" }).where(eq(deals.id, created.id));
    expect(await signalsOf(org, created.id)).toEqual(["HOLD_REVIEW_DUE"]);

    await db.update(deals).set({ onHoldUntil: "2099-01-01" }).where(eq(deals.id, created.id));
    expect(await signalsOf(org, created.id)).toEqual([]);
  });

  it("gives won and lost deals no signals", async () => {
    const org = await setupOrganization();
    const created = await dealIn(org);
    const won = await transitionDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { toStatus: "WON" } });
    expect(won.status).toBe("WON");
    expect(await signalsOf(org, created.id)).toEqual([]);
  });

  it("puts the signals on the pipeline cards", async () => {
    const org = await setupOrganization();
    const bare = await dealIn(org, { stage: "PROPOSAL", title: "Tanpa task" });
    const planned = await dealIn(org, { stage: "PROPOSAL", title: "Ada task" });
    await task(org, planned.id, daysAhead(1));

    const board = await getPipelineBoard({ headers: org.ownerHeaders });
    const cards = board.stages.find((stage) => stage.status === "PROPOSAL")!.items;
    expect(cards.find((card) => card.id === bare.id)).toMatchObject({ signals: ["NO_NEXT_STEP"], followUpOverdue: false });
    expect(cards.find((card) => card.id === planned.id)).toMatchObject({ signals: [], followUpOverdue: false });
  });

  describe("listDealsNeedingAttention", () => {
    it("lists open deals with a signal, largest value first, and leaves healthy, held and closed ones out", async () => {
      const org = await setupOrganization();
      const small = await dealIn(org, { estimatedValue: "1000000", title: "Kecil" });
      const big = await dealIn(org, { estimatedValue: "90000000", title: "Besar" });
      const healthy = await dealIn(org, { title: "Sehat" });
      await task(org, healthy.id, daysAhead(2));
      const closed = await dealIn(org, { title: "Tutup" });
      await transitionDeal({ headers: org.ownerHeaders, dealId: closed.id, expectedVersion: closed.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });
      const parked = await dealIn(org, { title: "Ditahan" });
      await putDealOnHold({ headers: org.ownerHeaders, dealId: parked.id, expectedVersion: parked.version, input: { reason: "Tunggu", reviewDate: "2099-01-01" } });

      const list = await listDealsNeedingAttention({ headers: org.ownerHeaders });
      expect(list.map((deal) => deal.id)).toEqual([big.id, small.id]);
      expect(list[0]).toMatchObject({ estimatedValue: "90000000", signals: ["NO_NEXT_STEP"] });
    });

    it("respects the limit, stays inside the organization, and is closed to Finance", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      await dealIn(org, { title: "A" });
      await dealIn(org, { title: "B" });
      await dealIn(other, { title: "Orang lain" });

      expect(await listDealsNeedingAttention({ headers: org.ownerHeaders, limit: 1 })).toHaveLength(1);
      expect((await listDealsNeedingAttention({ headers: org.ownerHeaders })).every((deal) => deal.title !== "Orang lain")).toBe(true);
      await expect(listDealsNeedingAttention({ headers: finance.headers })).rejects.toThrow();
    });
  });
});
