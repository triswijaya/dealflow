import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type postgres from "postgres";
import { deactivateMember } from "@/server/auth/members";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { activities, deals, followUps } from "@/server/db/schema";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createDeal, transitionDeal } from "./deals";
import {
  getDealDetail,
  getPipelineBoard,
  listAssignableMembers,
  listDealActivities,
  listDealRows,
  listPipelineStageCards,
  PIPELINE_COLUMN_LIMIT,
} from "./deal-views";

describe("deal read models", () => {
  let migrationClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function customerFor(org: TestOrg, companyName = "PT Maju Jaya") {
    return createCustomer({
      headers: org.ownerHeaders,
      input: { companyName, contactPerson: "Budi Santoso", phone: "08123456789" },
    });
  }

  async function dealFor(org: TestOrg, customerId: string, overrides: Record<string, unknown> = {}) {
    return createDeal({
      headers: org.ownerHeaders,
      input: { customerId, title: "CCTV Installation", estimatedValue: "10000000", assignedToId: org.ownerUserId, ...overrides },
    });
  }

  async function advance(org: TestOrg, deal: { id: string; version: number }, path: string[]) {
    let current = deal;
    for (const toStatus of path) {
      current = await transitionDeal({ headers: org.ownerHeaders, dealId: current.id, expectedVersion: current.version, input: { toStatus } });
    }
    return current as typeof current & { version: number };
  }

  describe("listDealRows", () => {
    it("combines status, assignee, customer and text filters", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi Setiawan");
      const a = await customerFor(org, "PT Maju Jaya");
      const b = await customerFor(org, "CV Cahaya Abadi");
      const one = await dealFor(org, a.id, { title: "Instalasi CCTV" });
      await dealFor(org, a.id, { title: "Jaringan kantor", assignedToId: sales.userId });
      await dealFor(org, b.id, { title: "Instalasi CCTV gudang" });
      await advance(org, one, ["CONTACTED"]);

      const titles = async (filters: Record<string, string>) =>
        (await listDealRows({ headers: org.ownerHeaders, filters })).items.map((row) => row.title).sort();

      expect(await titles({})).toHaveLength(3);
      expect(await titles({ query: "cctv" })).toEqual(["Instalasi CCTV", "Instalasi CCTV gudang"]);
      // The text search reaches the customer name as well as the title.
      expect(await titles({ query: "cahaya" })).toEqual(["Instalasi CCTV gudang"]);
      expect(await titles({ status: "CONTACTED" })).toEqual(["Instalasi CCTV"]);
      expect(await titles({ assignedToId: sales.userId })).toEqual(["Jaringan kantor"]);
      expect(await titles({ customerId: b.id })).toEqual(["Instalasi CCTV gudang"]);
      expect(await titles({ customerId: a.id, query: "jaringan" })).toEqual(["Jaringan kantor"]);

      const rows = (await listDealRows({ headers: org.ownerHeaders })).items;
      const assigned = rows.find((row) => row.title === "Jaringan kantor")!;
      expect(assigned.assignedToName).toBe("Andi Setiawan");
      expect(assigned.customerName).toBe("PT Maju Jaya");
    });

    it("treats % and _ in the query literally", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      await dealFor(org, customer.id, { title: "Diskon 10% khusus" });
      await dealFor(org, customer.id, { title: "Biasa" });
      const result = await listDealRows({ headers: org.ownerHeaders, filters: { query: "%" } });
      expect(result.items.map((row) => row.title)).toEqual(["Diskon 10% khusus"]);
    });

    it("filters an inclusive created-date range in the organization's timezone and rejects an inverted one", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const early = await dealFor(org, customer.id, { title: "Awal" });
      const late = await dealFor(org, customer.id, { title: "Akhir" });
      // Asia/Jakarta is UTC+7: 2026-09-12 23:30 UTC is already 13 Sep locally.
      await db.update(deals).set({ createdAt: new Date("2026-09-11T17:00:00Z") }).where(eq(deals.id, early.id)); // 12 Sep 00:00 local
      await db.update(deals).set({ createdAt: new Date("2026-09-12T23:30:00Z") }).where(eq(deals.id, late.id)); // 13 Sep 06:30 local

      const titles = async (createdFrom?: string, createdTo?: string) =>
        (await listDealRows({ headers: org.ownerHeaders, filters: { createdFrom, createdTo } })).items.map((row) => row.title).sort();

      expect(await titles("2026-09-12", "2026-09-12")).toEqual(["Awal"]);
      expect(await titles("2026-09-13", "2026-09-13")).toEqual(["Akhir"]);
      expect(await titles("2026-09-12", "2026-09-13")).toEqual(["Akhir", "Awal"]);
      expect(await titles("2026-09-14")).toEqual([]);
      await expect(listDealRows({ headers: org.ownerHeaders, filters: { createdFrom: "2026-09-13", createdTo: "2026-09-12" } })).rejects.toThrow(/date range/i);
    });

    it("sorts by value and puts deals without a target closing date last", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      await dealFor(org, customer.id, { title: "Kecil", estimatedValue: "1000000", expectedCloseDate: "2026-10-05" });
      await dealFor(org, customer.id, { title: "Besar", estimatedValue: "9000000" });
      await dealFor(org, customer.id, { title: "Sedang", estimatedValue: "5000000", expectedCloseDate: "2026-10-01" });

      const order = async (sort: "estimatedValue" | "expectedCloseDate", direction: "asc" | "desc") =>
        (await listDealRows({ headers: org.ownerHeaders, sort, direction })).items.map((row) => row.title);

      expect(await order("estimatedValue", "desc")).toEqual(["Besar", "Sedang", "Kecil"]);
      expect(await order("estimatedValue", "asc")).toEqual(["Kecil", "Sedang", "Besar"]);
      expect(await order("expectedCloseDate", "asc")).toEqual(["Sedang", "Kecil", "Besar"]);
      expect(await order("expectedCloseDate", "desc")).toEqual(["Kecil", "Sedang", "Besar"]);
    });

    it("keeps totalItems tied to the filters and shows Finance only WON deals", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await customerFor(org);
      const won = await dealFor(org, customer.id, { title: "Menang" });
      await dealFor(org, customer.id, { title: "Aktif" });
      await advance(org, won, ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"]);

      const filtered = await listDealRows({ headers: org.ownerHeaders, filters: { query: "a" }, pageSize: 1 });
      expect(filtered.totalItems).toBe(2);
      expect(filtered.totalPages).toBe(2);

      const asFinance = await listDealRows({ headers: finance.headers });
      expect(asFinance.items.map((row) => row.title)).toEqual(["Menang"]);
      expect(asFinance.totalItems).toBe(1);
      expect(asFinance.items[0]?.wonValue).toBe("10000000");
    });

    it("never returns another organization's deals (TENANT-04)", async () => {
      const first = await setupOrganization();
      const second = await setupOrganization();
      const customer = await customerFor(first);
      await dealFor(first, customer.id, { title: "Rahasia" });
      const result = await listDealRows({ headers: second.ownerHeaders, filters: { query: "Rahasia" } });
      expect(result.items).toEqual([]);
      expect(result.totalItems).toBe(0);
    });
  });

  describe("pipeline board", () => {
    it("reports whole-stage counts and values while limiting the visible cards, and pages the rest", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      for (let index = 1; index <= PIPELINE_COLUMN_LIMIT + 2; index += 1) {
        await dealFor(org, customer.id, { title: `Deal ${index}`, estimatedValue: "1000000" });
      }
      const moved = await dealFor(org, customer.id, { title: "Sudah dihubungi", estimatedValue: "2500000" });
      await advance(org, moved, ["CONTACTED"]);

      const board = await getPipelineBoard({ headers: org.ownerHeaders });
      expect(board.stages.map((stage) => stage.status)).toEqual(["NEW", "CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION"]);
      const fresh = board.stages[0]!;
      expect(fresh.count).toBe(PIPELINE_COLUMN_LIMIT + 2);
      expect(fresh.totalValue).toBe(String((PIPELINE_COLUMN_LIMIT + 2) * 1_000_000));
      expect(fresh.items).toHaveLength(PIPELINE_COLUMN_LIMIT);
      expect(board.stages[1]).toMatchObject({ count: 1, totalValue: "2500000" });
      expect(board.stages[2]).toMatchObject({ count: 0, totalValue: "0", items: [] });

      const rest = await listPipelineStageCards({ headers: org.ownerHeaders, status: "NEW", offset: PIPELINE_COLUMN_LIMIT });
      expect(rest).toHaveLength(2);
      const seen = new Set([...fresh.items, ...rest].map((card) => card.id));
      expect(seen.size).toBe(PIPELINE_COLUMN_LIMIT + 2);
    });

    it("flags a deal whose open follow-up is overdue, and only that one", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const overdue = await dealFor(org, customer.id, { title: "Terlambat" });
      const upcoming = await dealFor(org, customer.id, { title: "Mendatang" });
      const done = await dealFor(org, customer.id, { title: "Selesai" });
      const now = Date.now();
      const base = { organizationId: org.organizationId, type: "CALL", createdById: org.ownerUserId };
      await db.insert(followUps).values([
        { ...base, dealId: overdue.id, followUpAt: new Date(now - 3 * 86_400_000) },
        { ...base, dealId: upcoming.id, followUpAt: new Date(now + 3 * 86_400_000) },
        { ...base, dealId: done.id, followUpAt: new Date(now - 3 * 86_400_000), completedAt: new Date(now - 86_400_000) },
      ]);

      const board = await getPipelineBoard({ headers: org.ownerHeaders });
      const flags = Object.fromEntries(board.stages[0]!.items.map((card) => [card.title, card.followUpOverdue]));
      expect(flags).toEqual({ Terlambat: true, Mendatang: false, Selesai: false });
    });

    it("filters by assignee and text, and is closed to Finance", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await customerFor(org);
      await dealFor(org, customer.id, { title: "Milik owner" });
      await dealFor(org, customer.id, { title: "Milik Andi", assignedToId: sales.userId });

      const board = await getPipelineBoard({ headers: org.ownerHeaders, filters: { assignedToId: sales.userId } });
      expect(board.stages[0]!.items.map((card) => card.title)).toEqual(["Milik Andi"]);
      expect(board.stages[0]!.count).toBe(1);

      await expect(getPipelineBoard({ headers: finance.headers })).rejects.toThrow();
    });
  });

  describe("getDealDetail", () => {
    it("returns the customer, people and the time the deal entered each stage", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id, { description: "Instalasi", notes: "Catatan" });
      await advance(org, deal, ["CONTACTED", "QUALIFIED"]);

      const detail = await getDealDetail({ headers: org.ownerHeaders, dealId: deal.id });
      expect(detail.customer).toMatchObject({ id: customer.id, companyName: "PT Maju Jaya", contactPerson: "Budi Santoso" });
      expect(detail.assignedToName).toBe("Owner");
      expect(detail.createdByName).toBe("Owner");
      expect(detail.status).toBe("QUALIFIED");
      expect(Object.keys(detail.stageEnteredAt).sort()).toEqual(["CONTACTED", "NEW", "QUALIFIED"]);
      expect(detail.stageEnteredAt.NEW).toBe(detail.createdAt);
      expect(detail.stageEnteredAt.QUALIFIED! >= detail.stageEnteredAt.CONTACTED!).toBe(true);
    });

    it("records a lost deal's final stage with its reason", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id);
      await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus: "LOST", lostReason: "NO_RESPONSE", lostNote: "Tidak membalas" } });
      const detail = await getDealDetail({ headers: org.ownerHeaders, dealId: deal.id });
      expect(detail.status).toBe("LOST");
      expect(detail.lostReason).toBe("NO_RESPONSE");
      expect(detail.stageEnteredAt.LOST).toBeDefined();
    });

    it("answers NOT_FOUND for a missing, malformed, cross-tenant or (for Finance) non-WON deal", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id);

      for (const [headers, dealId] of [
        [org.ownerHeaders, "00000000-0000-4000-8000-000000000000"],
        [org.ownerHeaders, "not-a-uuid"],
        [other.ownerHeaders, deal.id],
        [finance.headers, deal.id],
      ] as const) {
        await expect(getDealDetail({ headers, dealId })).rejects.toThrow(/not found/i);
      }
    });
  });

  describe("listDealActivities", () => {
    it("hides finance events from Sales, and shows Finance only finance events plus the won event", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id);
      await advance(org, deal, ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"]);
      await db.insert(activities).values({
        organizationId: org.organizationId,
        dealId: deal.id,
        entityType: "invoice",
        eventType: "created",
        actorId: org.ownerUserId,
        metadata: { invoiceNumber: "INV-2026-00001" },
        permissionCategory: "finance",
      });

      const kinds = async (headers: Headers) =>
        (await listDealActivities({ headers, dealId: deal.id })).map((event) => `${event.entityType}.${event.eventType}`);

      const asOwner = await kinds(org.ownerHeaders);
      expect(asOwner).toContain("invoice.created");
      expect(asOwner).toContain("deal.created");
      expect(asOwner).toHaveLength(7);

      const asSales = await kinds(sales.headers);
      expect(asSales).not.toContain("invoice.created");
      expect(asSales).toHaveLength(6);

      expect((await kinds(finance.headers)).sort()).toEqual(["deal.won", "invoice.created"]);
    });

    it("lists newest first with the actor's name and a stable order for same-instant events", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id);
      await advance(org, deal, ["CONTACTED"]);
      const events = await listDealActivities({ headers: org.ownerHeaders, dealId: deal.id });
      expect(events.map((event) => event.eventType)).toEqual(["stage_changed", "created"]);
      expect(events[0]?.actorName).toBe("Owner");
      expect(events[0]?.metadata).toMatchObject({ fromStatus: "NEW", toStatus: "CONTACTED" });
    });

    it("answers NOT_FOUND for another organization's deal", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const customer = await customerFor(org);
      const deal = await dealFor(org, customer.id);
      await expect(listDealActivities({ headers: other.ownerHeaders, dealId: deal.id })).rejects.toThrow(/not found/i);
      expect(
        await db.query.activities.findMany({ where: and(eq(activities.dealId, deal.id)) }),
      ).toHaveLength(1);
    });
  });

  describe("listAssignableMembers", () => {
    it("lists active Sales, Admin and Owner members only", async () => {
      const org = await setupOrganization();
      await addMember(org, "SALES", "Andi");
      await addMember(org, "ADMIN", "Rina");
      await addMember(org, "FINANCE", "Dewi");
      const gone = await addMember(org, "SALES", "Mantan");
      await deactivateMember({ memberId: gone.memberId, headers: org.ownerHeaders });

      const members = await listAssignableMembers({ headers: org.ownerHeaders });
      expect(members.map((m) => m.name).sort()).toEqual(["Andi", "Owner", "Rina"]);
      expect(members.find((m) => m.name === "Owner")?.role).toBe("OWNER");
    });
  });
});
