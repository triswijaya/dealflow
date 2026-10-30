import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { createDeal,  } from "@/server/deals/deals";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { zonedLocalToInstant } from "@/lib/format";
import { organizationDateString } from "@/server/shared/organization-date";
import { completeFollowUp, createFollowUp } from "./follow-ups";
import { getFollowUpBadgeCount, getFollowUpCounts, getFollowUpRow, listFollowUpRows } from "./follow-up-views";
import { transitionOrWin } from "@/server/testing/orders";

const TZ = "Asia/Jakarta";

function dayOffset(base: string, days: number): string {
  const [year, month, day] = base.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

describe("follow-up read models", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function dealFor(org: TestOrg, title = "CCTV Installation", assignedToId = org.ownerUserId) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Maju Jaya", contactPerson: "Budi", phone: "08123456789" } });
    return createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title, estimatedValue: "10000000", assignedToId } });
  }

  const at = (date: string, time: string) => zonedLocalToInstant(`${date}T${time}`, TZ);
  const today = () => organizationDateString(TZ, new Date());

  it("splits open follow-ups into mutually exclusive buckets at local midnight", async () => {
    const org = await setupOrganization();
    const deal = await dealFor(org);
    const t = today();
    const create = (type: string, when: Date, note: string) =>
      createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type, note, followUpAt: when.toISOString() } });
    await create("CALL", at(dayOffset(t, -1), "23:59"), "kemarin malam");
    await create("WHATSAPP", at(t, "00:00"), "tengah malam ini");
    await create("EMAIL", at(t, "23:59"), "malam ini");
    await create("MEETING", at(dayOffset(t, 1), "00:00"), "besok pagi");

    const tab = async (name: "OVERDUE" | "TODAY" | "UPCOMING") =>
      (await listFollowUpRows({ headers: org.ownerHeaders, tab: name })).items.map((row) => row.note);

    expect(await tab("OVERDUE")).toEqual(["kemarin malam"]);
    expect(await tab("TODAY")).toEqual(["tengah malam ini", "malam ini"]);
    expect(await tab("UPCOMING")).toEqual(["besok pagi"]);
    expect(await getFollowUpCounts({ headers: org.ownerHeaders })).toEqual({ today: 2, overdue: 1, upcoming: 1, done: 0 });
    expect(await getFollowUpBadgeCount({ headers: org.ownerHeaders })).toBe(3);

    const rows = (await listFollowUpRows({ headers: org.ownerHeaders, tab: "TODAY" })).items;
    expect(rows[0]).toMatchObject({ bucket: "TODAY", dealTitle: "CCTV Installation", customerName: "PT Maju Jaya", customerPhone: "628123456789", dealValue: "10000000" });
  });

  it("leaves completed follow-ups and follow-ups on closed deals out of the open tabs, and reports last contact", async () => {
    const org = await setupOrganization();
    const active = await dealFor(org, "Aktif");
    const closing = await dealFor(org, "Akan kalah");
    const t = today();
    const yesterday = at(dayOffset(t, -1), "10:00");

    const done = await createFollowUp({ headers: org.ownerHeaders, input: { dealId: active.id, type: "CALL", note: "sudah", followUpAt: yesterday.toISOString() } });
    await completeFollowUp({ headers: org.ownerHeaders, followUpId: done.id, expectedVersion: done.version, input: { completedAt: yesterday.toISOString() } });
    await createFollowUp({ headers: org.ownerHeaders, input: { dealId: active.id, type: "CALL", note: "belum", followUpAt: at(dayOffset(t, 2), "09:00").toISOString() } });
    await createFollowUp({ headers: org.ownerHeaders, input: { dealId: closing.id, type: "CALL", note: "sisa", followUpAt: at(dayOffset(t, 1), "09:00").toISOString() } });
    await transitionOrWin({ headers: org.ownerHeaders, dealId: closing.id, expectedVersion: closing.version, input: { toStatus: "LOST", lostReason: "OTHER" } });

    const counts = await getFollowUpCounts({ headers: org.ownerHeaders });
    expect(counts).toEqual({ today: 0, overdue: 0, upcoming: 1, done: 1 });

    const upcoming = (await listFollowUpRows({ headers: org.ownerHeaders, tab: "UPCOMING" })).items;
    expect(upcoming.map((row) => row.note)).toEqual(["belum"]);
    expect(upcoming[0]?.lastContactAt).toBe(yesterday.toISOString());

    const finished = (await listFollowUpRows({ headers: org.ownerHeaders, tab: "DONE" })).items;
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ note: "sudah", bucket: null, completedByName: "Owner" });

    // Untabbed (the deal page): the old follow-up on the closed deal is still there, just not "open work".
    const all = (await listFollowUpRows({ headers: org.ownerHeaders, filters: { dealId: closing.id } })).items;
    expect(all).toHaveLength(1);
    expect(all[0]?.bucket).toBeNull();
    expect(all[0]?.completedAt).toBeNull();
  });

  it("filters by type, assigned sales and an inclusive follow-up date range", async () => {
    const org = await setupOrganization();
    const sales = await addMember(org, "SALES", "Andi");
    const mine = await dealFor(org, "Milik owner");
    const theirs = await dealFor(org, "Milik Andi", sales.userId);
    const t = today();
    const day = dayOffset(t, 3);
    await createFollowUp({ headers: org.ownerHeaders, input: { dealId: mine.id, type: "CALL", note: "a", followUpAt: at(day, "00:00").toISOString() } });
    await createFollowUp({ headers: org.ownerHeaders, input: { dealId: theirs.id, type: "WHATSAPP", note: "b", followUpAt: at(day, "23:59").toISOString() } });
    await createFollowUp({ headers: org.ownerHeaders, input: { dealId: theirs.id, type: "WHATSAPP", note: "c", followUpAt: at(dayOffset(day, 1), "00:00").toISOString() } });

    const notes = async (filters: Record<string, string>) =>
      (await listFollowUpRows({ headers: org.ownerHeaders, tab: "UPCOMING", filters })).items.map((row) => row.note);

    expect(await notes({ type: "WHATSAPP" })).toEqual(["b", "c"]);
    expect(await notes({ assignedToId: sales.userId })).toEqual(["b", "c"]);
    expect(await notes({ from: day, to: day })).toEqual(["a", "b"]);
    expect(await notes({ from: dayOffset(day, 1) })).toEqual(["c"]);
    await expect(listFollowUpRows({ headers: org.ownerHeaders, filters: { from: dayOffset(day, 1), to: day } })).rejects.toThrow(/date range/i);

    const counts = await getFollowUpCounts({ headers: org.ownerHeaders, filters: { type: "WHATSAPP" } });
    expect(counts.upcoming).toBe(2);
  });

  it("is closed to Finance and to other organizations", async () => {
    const org = await setupOrganization();
    const other = await setupOrganization();
    const finance = await addMember(org, "FINANCE", "Dewi");
    const deal = await dealFor(org);
    const created = await createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "CALL", followUpAt: at(dayOffset(today(), 1), "09:00").toISOString() } });

    await expect(listFollowUpRows({ headers: finance.headers })).rejects.toThrow();
    await expect(getFollowUpCounts({ headers: finance.headers })).rejects.toThrow();
    expect((await listFollowUpRows({ headers: other.ownerHeaders, tab: "UPCOMING" })).items).toEqual([]);
    await expect(getFollowUpRow({ headers: other.ownerHeaders, followUpId: created.id })).rejects.toThrow(/not found/i);
    await expect(getFollowUpRow({ headers: org.ownerHeaders, followUpId: "not-a-uuid" })).rejects.toThrow(/not found/i);
    expect((await getFollowUpRow({ headers: org.ownerHeaders, followUpId: created.id })).note).toBeNull();
  });
});
