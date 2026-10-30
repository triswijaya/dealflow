import { describe, expect, it } from "vitest";
import { billingItemStatus, orderStatus, runningValue, type BillingItemFacts } from "./billing";

const base: BillingItemFacts = { trigger: "ON_ORDER", dueOn: null, milestoneDoneAt: null, cancelledAt: null, hasLiveInvoice: false };
const status = (overrides: Partial<BillingItemFacts>, today = "2026-10-30") => billingItemStatus({ ...base, ...overrides }, today);

describe("billingItemStatus (BIL-03)", () => {
  it("is READY at once for ON_ORDER", () => {
    expect(status({})).toBe("READY");
  });

  it("is PLANNED until the due date, READY on it (inclusive)", () => {
    expect(status({ trigger: "ON_DATE", dueOn: "2026-10-31" })).toBe("PLANNED");
    expect(status({ trigger: "ON_DATE", dueOn: "2026-10-30" })).toBe("READY");
    expect(status({ trigger: "ON_DATE", dueOn: "2026-10-01" })).toBe("READY");
  });

  it("is PLANNED until the milestone is done", () => {
    expect(status({ trigger: "ON_MILESTONE" })).toBe("PLANNED");
    expect(status({ trigger: "ON_MILESTONE", milestoneDoneAt: new Date() })).toBe("READY");
  });

  it("is INVOICED while a live invoice exists, even before the trigger", () => {
    expect(status({ trigger: "ON_MILESTONE", hasLiveInvoice: true })).toBe("INVOICED");
  });

  it("is CANCELLED above everything", () => {
    expect(status({ cancelledAt: new Date(), hasLiveInvoice: true })).toBe("CANCELLED");
  });
});

describe("orderStatus (ORD-05)", () => {
  const order = (itemStatuses: Parameters<typeof orderStatus>[0]["itemStatuses"], liveInvoicesPaid: boolean[] = [], cancelledAt: Date | null = null) =>
    orderStatus({ cancelledAt, itemStatuses, liveInvoicesPaid });

  it("is ACTIVE while something is left to bill", () => {
    expect(order(["INVOICED", "READY"], [true])).toBe("ACTIVE");
    expect(order(["PLANNED"])).toBe("ACTIVE");
  });

  it("is FULLY_BILLED when every live item is invoiced but not every invoice is paid", () => {
    expect(order(["INVOICED", "INVOICED", "CANCELLED"], [true, false])).toBe("FULLY_BILLED");
  });

  it("is CLOSED when it is fully billed and all invoices are paid", () => {
    expect(order(["INVOICED", "CANCELLED"], [true])).toBe("CLOSED");
  });

  it("is CANCELLED when cancelled, and an order with no live items is only ACTIVE", () => {
    expect(order(["INVOICED"], [true], new Date())).toBe("CANCELLED");
    expect(order(["CANCELLED"])).toBe("ACTIVE");
  });
});

describe("runningValue (ORD-03)", () => {
  it("adds signed amendments to the original value", () => {
    expect(runningValue(100n, [])).toBe(100n);
    expect(runningValue(100n, [30n, -50n])).toBe(80n);
  });
});
