import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { activities, deals } from "@/server/db/schema";
import { createQuotation, transitionQuotationStatus } from "@/server/quotations/quotations";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createDeal, putDealOnHold, reopenDeal, resumeDeal, transitionDeal } from "./deals";
import { getPipelineBoard } from "./deal-views";
import { getPipelineMetrics } from "@/server/dashboard/dashboard";

describe("deal on hold and reopen (DEAL-03)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function dealIn(org: TestOrg, overrides: Record<string, unknown> = {}) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Maju", contactPerson: "Budi", phone: "08123456789" } });
    return createDeal({
      headers: org.ownerHeaders,
      input: { customerId: customer.id, title: "CCTV", estimatedValue: "30000000", assignedToId: org.ownerUserId, ...overrides },
    });
  }

  const events = (dealId: string, eventType: string) =>
    db.query.activities.findMany({ where: and(eq(activities.dealId, dealId), eq(activities.eventType, eventType)) });

  describe("putDealOnHold and resumeDeal", () => {
    it("holds an open deal without changing its stage, then resumes it", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org, { stage: "NEGOTIATION" });

      const held = await putDealOnHold({
        headers: org.ownerHeaders,
        dealId: created.id,
        expectedVersion: created.version,
        input: { reason: "  Menunggu anggaran tahun depan ", reviewDate: orgDay(30) },
      });
      expect(held).toMatchObject({ status: "NEGOTIATION", onHoldUntil: orgDay(30), onHoldReason: "Menunggu anggaran tahun depan", version: 2 });
      expect((await events(created.id, "on_hold"))[0]?.metadata).toEqual({
        stage: "NEGOTIATION",
        reason: "Menunggu anggaran tahun depan",
        reviewDate: orgDay(30),
      });

      const resumed = await resumeDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: held.version });
      expect(resumed).toMatchObject({ status: "NEGOTIATION", onHoldUntil: null, onHoldReason: null, version: 3 });
      expect(await events(created.id, "resumed")).toHaveLength(1);
    });

    it("accepts today as the review date and refuses yesterday, with no change to the deal", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);

      await expect(
        putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(-1) } }),
      ).rejects.toThrow(/past/);
      const unchanged = await db.query.deals.findFirst({ where: eq(deals.id, created.id) });
      expect(unchanged).toMatchObject({ onHoldUntil: null, version: 1 });

      const today = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(0) } });
      expect(today.onHoldUntil).toBe(orgDay(0));
    });

    it("requires a reason and a valid date", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);
      const hold = (input: unknown) => putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input });

      await expect(hold({ reason: "   ", reviewDate: orgDay(3) })).rejects.toThrow();
      await expect(hold({ reviewDate: orgDay(3) })).rejects.toThrow();
      await expect(hold({ reason: "Tunggu", reviewDate: "besok" })).rejects.toThrow();
      expect(await events(created.id, "on_hold")).toHaveLength(0);
    });

    it("extends a hold by holding again, and records the date it replaced", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);
      const first = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(7) } });
      const second = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: first.version, input: { reason: "Masih tunggu", reviewDate: orgDay(21) } });

      expect(second).toMatchObject({ onHoldUntil: orgDay(21), onHoldReason: "Masih tunggu" });
      const logged = (await events(created.id, "on_hold")).map((event) => event.metadata);
      expect(logged).toContainEqual(expect.objectContaining({ reviewDate: orgDay(21), previousReviewDate: orgDay(7) }));
    });

    it("refuses stage moves while on hold, still allows WON and LOST, and clears the hold", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);
      const held = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } });

      await expect(transitionDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: held.version, input: { toStatus: "PROPOSAL" } })).rejects.toThrow(/on hold/);
      expect((await db.query.deals.findFirst({ where: eq(deals.id, created.id) }))).toMatchObject({ status: "PROSPECT", version: held.version });

      const lost = await transitionDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: held.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });
      expect(lost).toMatchObject({ status: "LOST", onHoldUntil: null, onHoldReason: null });

      const other = await dealIn(org, { title: "Lain" });
      const otherHeld = await putDealOnHold({ headers: org.ownerHeaders, dealId: other.id, expectedVersion: other.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } });
      const won = await transitionDeal({ headers: org.ownerHeaders, dealId: other.id, expectedVersion: otherHeld.version, input: { toStatus: "WON" } });
      expect(won).toMatchObject({ status: "WON", onHoldUntil: null });
    });

    it("refuses to hold a closed deal, and treats resuming a deal that is not on hold as a no-op", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);

      const same = await resumeDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version });
      expect(same.version).toBe(1);
      expect(await events(created.id, "resumed")).toHaveLength(0);

      const lost = await transitionDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { toStatus: "LOST", lostReason: "OTHER" } });
      await expect(
        putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: lost.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } }),
      ).rejects.toThrow(/open deal/);
    });

    it("rejects a stale version without leaving an event", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);
      await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } });

      await expect(
        putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { reason: "Lagi", reviewDate: orgDay(9) } }),
      ).rejects.toThrow(/modified by someone else/);
      expect(await events(created.id, "on_hold")).toHaveLength(1);
    });

    it("keeps held deals off the pipeline board and out of the pipeline value, reporting them apart", async () => {
      const org = await setupOrganization();
      const live = await dealIn(org, { stage: "PROPOSAL", estimatedValue: "10000000" });
      const parked = await dealIn(org, { stage: "PROPOSAL", estimatedValue: "40000000", title: "Ditahan" });
      await putDealOnHold({ headers: org.ownerHeaders, dealId: parked.id, expectedVersion: parked.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } });

      const board = await getPipelineBoard({ headers: org.ownerHeaders });
      const proposal = board.stages.find((stage) => stage.status === "PROPOSAL")!;
      expect(proposal).toMatchObject({ count: 1, totalValue: "10000000" });
      expect(proposal.items.map((card) => card.id)).toEqual([live.id]);

      const metrics = await getPipelineMetrics({ headers: org.ownerHeaders });
      expect(metrics.totalValue).toBe("10000000");
      expect(metrics.onHold).toEqual({ count: 1, value: "40000000" });
    });

    it("refuses to send a quotation while the deal is on hold, and allows it after resume (QUO-08)", async () => {
      const org = await setupOrganization();
      const created = await dealIn(org);
      const quotation = await createQuotation({
        headers: org.ownerHeaders,
        input: { dealId: created.id, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "2", unit: "pcs", unitPrice: "1000000" }] },
      });
      const held = await putDealOnHold({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: (await db.query.deals.findFirst({ where: eq(deals.id, created.id) }))!.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } });

      await expect(
        transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: quotation.id, expectedEditVersion: quotation.editVersion, toStatus: "SENT" }),
      ).rejects.toThrow(/on hold/);

      await resumeDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: held.version });
      const sent = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: quotation.id, expectedEditVersion: quotation.editVersion, toStatus: "SENT" });
      expect(sent.status).toBe("SENT");
    });

    it("lets Finance do nothing here", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const created = await dealIn(org);
      await expect(
        putDealOnHold({ headers: finance.headers, dealId: created.id, expectedVersion: created.version, input: { reason: "Tunggu", reviewDate: orgDay(5) } }),
      ).rejects.toThrow();
    });
  });

  describe("reopenDeal", () => {
    async function lostDeal(org: TestOrg, overrides: Record<string, unknown> = {}) {
      const created = await dealIn(org, overrides);
      return transitionDeal({ headers: org.ownerHeaders, dealId: created.id, expectedVersion: created.version, input: { toStatus: "LOST", lostReason: "PRICE_TOO_HIGH", lostNote: "Mahal" } });
    }

    it("returns a lost deal to the chosen stage, clears the lost fields and keeps the history", async () => {
      const org = await setupOrganization();
      const lost = await lostDeal(org);

      const reopened = await reopenDeal({
        headers: org.ownerHeaders,
        dealId: lost.id,
        expectedVersion: lost.version,
        input: { toStatus: "NEGOTIATION", reason: "  Customer menghubungi lagi dengan harga baru  " },
      });
      expect(reopened).toMatchObject({ status: "NEGOTIATION", lostAt: null, lostReason: null, lostNote: null });

      expect((await events(lost.id, "lost"))).toHaveLength(1);
      expect((await events(lost.id, "reopened"))[0]?.metadata).toEqual({
        fromStatus: "LOST",
        toStatus: "NEGOTIATION",
        reason: "Customer menghubungi lagi dengan harga baru",
        previousLostReason: "PRICE_TOO_HIGH",
      });
      const row = await db.query.deals.findFirst({ where: eq(deals.id, lost.id) });
      expect(row!.stageEnteredAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());
    });

    it("needs a reason, an active target stage and a value for that stage", async () => {
      const org = await setupOrganization();
      const lost = await lostDeal(org);
      const reopen = (input: unknown) => reopenDeal({ headers: org.ownerHeaders, dealId: lost.id, expectedVersion: lost.version, input });

      await expect(reopen({ toStatus: "PROSPECT", reason: "" })).rejects.toThrow();
      await expect(reopen({ toStatus: "PROSPECT" })).rejects.toThrow();
      await expect(reopen({ toStatus: "WON", reason: "Coba" })).rejects.toThrow();
      await expect(reopen({ toStatus: "LOST", reason: "Coba" })).rejects.toThrow();
      expect(await db.query.deals.findFirst({ where: eq(deals.id, lost.id) })).toMatchObject({ status: "LOST", version: lost.version });

      const empty = await lostDeal(org, { estimatedValue: "0", title: "Tanpa nilai" });
      await expect(
        reopenDeal({ headers: org.ownerHeaders, dealId: empty.id, expectedVersion: empty.version, input: { toStatus: "PROPOSAL", reason: "Coba" } }),
      ).rejects.toThrow(/positive/);
      const prospect = await reopenDeal({ headers: org.ownerHeaders, dealId: empty.id, expectedVersion: empty.version, input: { toStatus: "PROSPECT", reason: "Coba lagi" } });
      expect(prospect.status).toBe("PROSPECT");
    });

    it("only reopens a lost deal", async () => {
      const org = await setupOrganization();
      const open = await dealIn(org);
      await expect(
        reopenDeal({ headers: org.ownerHeaders, dealId: open.id, expectedVersion: open.version, input: { toStatus: "PROPOSAL", reason: "Coba" } }),
      ).rejects.toThrow(/lost deal/);

      const won = await transitionDeal({ headers: org.ownerHeaders, dealId: open.id, expectedVersion: open.version, input: { toStatus: "WON" } });
      await expect(
        reopenDeal({ headers: org.ownerHeaders, dealId: won.id, expectedVersion: won.version, input: { toStatus: "PROPOSAL", reason: "Coba" } }),
      ).rejects.toThrow(/lost deal/);
    });

    it("lets Owner/Admin reopen any lost deal and Sales only their own", async () => {
      const org = await setupOrganization();
      const andi = await addMember(org, "SALES", "Andi");
      const rina = await addMember(org, "SALES", "Rina");
      const admin = await addMember(org, "ADMIN", "Maya");
      const mine = await lostDeal(org, { assignedToId: andi.userId });
      const input = { toStatus: "PROPOSAL", reason: "Dibuka lagi" };

      await expect(reopenDeal({ headers: rina.headers, dealId: mine.id, expectedVersion: mine.version, input })).rejects.toThrow(/assigned sales/);
      const byAssignee = await reopenDeal({ headers: andi.headers, dealId: mine.id, expectedVersion: mine.version, input });
      expect(byAssignee.status).toBe("PROPOSAL");

      const other = await lostDeal(org, { assignedToId: andi.userId, title: "Lain" });
      expect((await reopenDeal({ headers: admin.headers, dealId: other.id, expectedVersion: other.version, input })).status).toBe("PROPOSAL");

      const third = await lostDeal(org, { title: "Ketiga" });
      expect((await reopenDeal({ headers: org.ownerHeaders, dealId: third.id, expectedVersion: third.version, input })).status).toBe("PROPOSAL");
    });

    it("rejects a stale version and a Finance caller, leaving the deal lost", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const lost = await lostDeal(org);
      const input = { toStatus: "PROPOSAL", reason: "Coba" };

      await expect(reopenDeal({ headers: finance.headers, dealId: lost.id, expectedVersion: lost.version, input })).rejects.toThrow();
      await expect(reopenDeal({ headers: org.ownerHeaders, dealId: lost.id, expectedVersion: lost.version - 1, input })).rejects.toThrow(/modified by someone else/);
      expect(await events(lost.id, "reopened")).toHaveLength(0);
      expect((await db.query.deals.findFirst({ where: eq(deals.id, lost.id) }))!.status).toBe("LOST");
    });
  });
});
