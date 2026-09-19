import { describe, expect, it } from "vitest";
import { invoiceEffectiveStatus, invoiceRemainingAmount } from "./effective-status";

const TOTAL = 30_000_000n;

describe("invoiceEffectiveStatus", () => {
  it("is UNPAID with no payments before the due date", () => {
    expect(invoiceEffectiveStatus({ total: TOTAL, paidAmount: 0n, dueDate: "2026-10-19" }, "2026-10-01")).toBe(
      "UNPAID",
    );
  });

  it("is PARTIALLY_PAID once some but not all of the total is paid", () => {
    expect(
      invoiceEffectiveStatus({ total: TOTAL, paidAmount: 10_000_000n, dueDate: "2026-10-19" }, "2026-10-01"),
    ).toBe("PARTIALLY_PAID");
  });

  it("is PAID when the total is fully covered", () => {
    expect(invoiceEffectiveStatus({ total: TOTAL, paidAmount: TOTAL, dueDate: "2026-10-19" }, "2026-10-01")).toBe(
      "PAID",
    );
  });

  it("is not overdue exactly on the due date (INV-06)", () => {
    expect(invoiceEffectiveStatus({ total: TOTAL, paidAmount: 0n, dueDate: "2026-10-19" }, "2026-10-19")).toBe(
      "UNPAID",
    );
  });

  it("becomes OVERDUE the day after the due date", () => {
    expect(invoiceEffectiveStatus({ total: TOTAL, paidAmount: 0n, dueDate: "2026-10-19" }, "2026-10-20")).toBe(
      "OVERDUE",
    );
  });

  it("OVERDUE beats PARTIALLY_PAID once past the due date (INV-06)", () => {
    expect(
      invoiceEffectiveStatus({ total: TOTAL, paidAmount: 10_000_000n, dueDate: "2026-10-19" }, "2026-10-20"),
    ).toBe("OVERDUE");
  });

  it("PAID outranks OVERDUE: paid late is still PAID, not overdue (INV-06)", () => {
    expect(invoiceEffectiveStatus({ total: TOTAL, paidAmount: TOTAL, dueDate: "2026-10-19" }, "2026-11-30")).toBe(
      "PAID",
    );
  });

  it("treats an over-settled total as PAID, not unpaid (§3: paid_amount >= total)", () => {
    // recordPayment refuses to overpay; this guards a future data import
    // from producing an invoice that is over-settled yet shows as unpaid.
    expect(
      invoiceEffectiveStatus({ total: TOTAL, paidAmount: TOTAL + 1n, dueDate: "2026-10-19" }, "2026-11-30"),
    ).toBe("PAID");
  });
});

describe("invoiceRemainingAmount", () => {
  it("is the unpaid balance", () => {
    expect(invoiceRemainingAmount(TOTAL, 10_000_000n)).toBe(20_000_000n);
  });

  it("is the full total when nothing is paid", () => {
    expect(invoiceRemainingAmount(TOTAL, 0n)).toBe(TOTAL);
  });

  it("clamps at zero rather than going negative (§10.2 max(total - paid, 0))", () => {
    expect(invoiceRemainingAmount(TOTAL, TOTAL)).toBe(0n);
    expect(invoiceRemainingAmount(TOTAL, TOTAL + 5_000_000n)).toBe(0n);
  });
});
