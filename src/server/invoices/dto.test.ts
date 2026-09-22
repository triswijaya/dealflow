import { describe, expect, it } from "vitest";
import { toInvoiceDto, toPaymentDto, toPaymentResultDto } from "./dto";

function makeInvoiceRow(overrides: Partial<Parameters<typeof toInvoiceDto>[0]> = {}) {
  return {
    id: "inv_1",
    organizationId: "org_1",
    dealId: "deal_1",
    customerId: "cus_1",
    invoiceNumber: "INV-2026-00001",
    quotationId: null,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    subtotal: 30_000_000n,
    discount: 0n,
    tax: 0n,
    total: 30_000_000n,
    calculationVersion: 1,
    currency: "IDR",
    notes: "Termin 2x",
    terms: "Net 30",
    sellerSnapshot: null,
    customerSnapshot: null,
    createdAt: new Date("2026-03-01T01:00:00.000Z"),
    updatedAt: new Date("2026-03-01T01:00:00.000Z"),
    createdById: "user_1",
    ...overrides,
  };
}

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item_1",
    organizationId: "org_1",
    invoiceId: "inv_1",
    description: "Kamera CCTV 4MP",
    quantity: "4.000",
    unit: "unit",
    unitPrice: 1_500_000n,
    subtotal: 6_000_000n,
    sortOrder: 0,
    ...overrides,
  };
}

function makePaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    organizationId: "org_1",
    invoiceId: "inv_1",
    amount: 10_000_000n,
    paymentDate: "2026-03-15",
    paymentMethod: "BANK_TRANSFER",
    reference: "TRX-001",
    note: null,
    createdAt: new Date("2026-03-15T04:00:00.000Z"),
    createdById: "user_1",
    ...overrides,
  };
}

describe("toInvoiceDto", () => {
  it("maps every field, converting money/timestamps and excluding calculationVersion", () => {
    const dto = toInvoiceDto(makeInvoiceRow(), [], 0n, "2026-03-15");
    expect(dto).toEqual({
      id: "inv_1",
      organizationId: "org_1",
      dealId: "deal_1",
      customerId: "cus_1",
      invoiceNumber: "INV-2026-00001",
      quotationId: null,
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      subtotal: "30000000",
      discount: "0",
      tax: "0",
      total: "30000000",
      currency: "IDR",
      notes: "Termin 2x",
      terms: "Net 30",
      status: "UNPAID",
      paidAmount: "0",
      remainingAmount: "30000000",
      sellerSnapshot: null,
      customerSnapshot: null,
      createdAt: "2026-03-01T01:00:00.000Z",
      updatedAt: "2026-03-01T01:00:00.000Z",
      createdById: "user_1",
      items: [],
    });
  });

  it("computes PARTIALLY_PAID and the remaining balance from paidAmount, never a stored column", () => {
    const dto = toInvoiceDto(makeInvoiceRow(), [], 10_000_000n, "2026-03-15");
    expect(dto.status).toBe("PARTIALLY_PAID");
    expect(dto.paidAmount).toBe("10000000");
    expect(dto.remainingAmount).toBe("20000000");
  });

  it("computes PAID once paidAmount reaches the total, even past the due date (INV-06 priority)", () => {
    const dto = toInvoiceDto(makeInvoiceRow({ dueDate: "2026-01-01" }), [], 30_000_000n, "2026-03-15");
    expect(dto.status).toBe("PAID");
    expect(dto.remainingAmount).toBe("0");
  });

  it("computes OVERDUE for an unpaid invoice past its due date", () => {
    const dto = toInvoiceDto(makeInvoiceRow({ dueDate: "2026-01-01" }), [], 0n, "2026-03-15");
    expect(dto.status).toBe("OVERDUE");
  });

  it("carries converted items", () => {
    const dto = toInvoiceDto(makeInvoiceRow(), [makeItemRow()], 0n, "2026-03-15");
    expect(dto.items).toEqual([
      {
        id: "item_1",
        description: "Kamera CCTV 4MP",
        quantity: "4.000",
        unit: "unit",
        unitPrice: "1500000",
        subtotal: "6000000",
        sortOrder: 0,
      },
    ]);
  });

  it("never leaks calculationVersion or any field beyond the declared DTO shape", () => {
    const dto = toInvoiceDto(makeInvoiceRow(), [], 0n, "2026-03-15");
    expect(Object.keys(dto)).not.toContain("calculationVersion");
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "dealId",
        "customerId",
        "invoiceNumber",
        "quotationId",
        "issueDate",
        "dueDate",
        "subtotal",
        "discount",
        "tax",
        "total",
        "currency",
        "notes",
        "terms",
        "status",
        "paidAmount",
        "remainingAmount",
        "sellerSnapshot",
        "customerSnapshot",
        "createdAt",
        "updatedAt",
        "createdById",
        "items",
      ].sort(),
    );
  });

  it("is safe to JSON.stringify", () => {
    expect(() => JSON.stringify(toInvoiceDto(makeInvoiceRow(), [makeItemRow()], 10_000_000n, "2026-03-15"))).not.toThrow();
  });
});

describe("toPaymentDto", () => {
  it("maps every field, converting amount and timestamp", () => {
    expect(toPaymentDto(makePaymentRow())).toEqual({
      id: "pay_1",
      organizationId: "org_1",
      invoiceId: "inv_1",
      amount: "10000000",
      paymentDate: "2026-03-15",
      paymentMethod: "BANK_TRANSFER",
      reference: "TRX-001",
      note: null,
      createdAt: "2026-03-15T04:00:00.000Z",
      createdById: "user_1",
    });
  });

  it("never leaks a field beyond the declared DTO shape", () => {
    const dto = toPaymentDto(makePaymentRow());
    expect(Object.keys(dto).sort()).toEqual(
      ["id", "organizationId", "invoiceId", "amount", "paymentDate", "paymentMethod", "reference", "note", "createdAt", "createdById"].sort(),
    );
  });
});

describe("toPaymentResultDto", () => {
  it("composes the payment DTO with the invoice's latest balance (API-01's 'payment + latest invoice balance')", () => {
    const dto = toPaymentResultDto(makePaymentRow(), makeInvoiceRow(), 10_000_000n, "2026-03-15");
    expect(dto).toEqual({
      payment: {
        id: "pay_1",
        organizationId: "org_1",
        invoiceId: "inv_1",
        amount: "10000000",
        paymentDate: "2026-03-15",
        paymentMethod: "BANK_TRANSFER",
        reference: "TRX-001",
        note: null,
        createdAt: "2026-03-15T04:00:00.000Z",
        createdById: "user_1",
      },
      invoiceId: "inv_1",
      invoiceNumber: "INV-2026-00001",
      total: "30000000",
      paidAmount: "10000000",
      remainingAmount: "20000000",
      status: "PARTIALLY_PAID",
    });
  });

  it("is safe to JSON.stringify", () => {
    expect(() => JSON.stringify(toPaymentResultDto(makePaymentRow(), makeInvoiceRow(), 30_000_000n, "2026-03-15"))).not.toThrow();
  });
});
