import { describe, expect, it } from "vitest";
import { toQuotationDto, toQuotationSummaryDto } from "./dto";

function makeRow(overrides: Partial<Parameters<typeof toQuotationSummaryDto>[0]> = {}) {
  return {
    id: "quo_1",
    organizationId: "org_1",
    dealId: "deal_1",
    customerId: "cus_1",
    quotationNumber: "QT-2026-00001",
    familyId: "quo_1",
    revisionNumber: 1,
    previousRevisionId: null,
    isLatest: true,
    issueDate: "2026-03-01",
    validUntil: "2026-03-31",
    subtotal: 100_000_000n,
    discount: 5_000_000n,
    tax: 10_000_000n,
    total: 105_000_000n,
    calculationVersion: 1,
    notes: "Pembayaran DP 50%",
    terms: "Net 30",
    status: "DRAFT",
    sentAt: null,
    acceptedAt: null,
    acceptedById: null,
    rejectedAt: null,
    rejectedById: null,
    frozenAt: null,
    sellerSnapshot: null,
    customerSnapshot: null,
    editVersion: 1,
    createdAt: new Date("2026-03-01T01:00:00.000Z"),
    updatedAt: new Date("2026-03-01T01:00:00.000Z"),
    createdById: "user_1",
    updatedById: null,
    ...overrides,
  };
}

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item_1",
    organizationId: "org_1",
    quotationId: "quo_1",
    description: "Kamera CCTV 4MP",
    quantity: "4.000",
    unit: "unit",
    unitPrice: 1_500_000n,
    subtotal: 6_000_000n,
    sortOrder: 0,
    ...overrides,
  };
}

describe("toQuotationSummaryDto", () => {
  it("maps every field, converting money/timestamps and excluding calculationVersion", () => {
    const dto = toQuotationSummaryDto(makeRow(), "2026-03-15");
    expect(dto).toEqual({
      id: "quo_1",
      organizationId: "org_1",
      dealId: "deal_1",
      customerId: "cus_1",
      quotationNumber: "QT-2026-00001",
      familyId: "quo_1",
      revisionNumber: 1,
      previousRevisionId: null,
      isLatest: true,
      issueDate: "2026-03-01",
      validUntil: "2026-03-31",
      subtotal: "100000000",
      discount: "5000000",
      tax: "10000000",
      total: "105000000",
      notes: "Pembayaran DP 50%",
      terms: "Net 30",
      status: "DRAFT",
      sentAt: null,
      acceptedAt: null,
      acceptedById: null,
      rejectedAt: null,
      rejectedById: null,
      frozenAt: null,
      sellerSnapshot: null,
      customerSnapshot: null,
      editVersion: 1,
      createdAt: "2026-03-01T01:00:00.000Z",
      updatedAt: "2026-03-01T01:00:00.000Z",
      createdById: "user_1",
      updatedById: null,
    });
  });

  it("overrides a SENT-past-validUntil row to display EXPIRED (QUO-10), not the raw stored status", () => {
    const dto = toQuotationSummaryDto(makeRow({ status: "SENT", validUntil: "2026-03-01" }), "2026-03-15");
    expect(dto.status).toBe("EXPIRED");
  });

  it("keeps a SENT row within its validity window as SENT", () => {
    const dto = toQuotationSummaryDto(makeRow({ status: "SENT", validUntil: "2026-04-01" }), "2026-03-15");
    expect(dto.status).toBe("SENT");
  });

  it("converts a frozen/sent/accepted row's timestamps and actor ids", () => {
    const dto = toQuotationSummaryDto(
      makeRow({
        status: "ACCEPTED",
        sentAt: new Date("2026-03-02T00:00:00.000Z"),
        acceptedAt: new Date("2026-03-03T00:00:00.000Z"),
        acceptedById: "user_2",
        frozenAt: new Date("2026-03-02T00:00:00.000Z"),
        sellerSnapshot: { name: "NusaTech", address: null, contactEmail: null, contactPhone: null },
        customerSnapshot: { companyName: "PT Maju Jaya", contactPerson: null, phone: null, email: null, address: null },
      }),
      "2026-03-15",
    );
    expect(dto.sentAt).toBe("2026-03-02T00:00:00.000Z");
    expect(dto.acceptedAt).toBe("2026-03-03T00:00:00.000Z");
    expect(dto.acceptedById).toBe("user_2");
    expect(dto.frozenAt).toBe("2026-03-02T00:00:00.000Z");
    expect(dto.sellerSnapshot).toEqual({ name: "NusaTech", address: null, contactEmail: null, contactPhone: null });
  });

  it("never leaks calculationVersion or any field beyond the declared DTO shape", () => {
    const dto = toQuotationSummaryDto(makeRow(), "2026-03-15");
    expect(Object.keys(dto)).not.toContain("calculationVersion");
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "dealId",
        "customerId",
        "quotationNumber",
        "familyId",
        "revisionNumber",
        "previousRevisionId",
        "isLatest",
        "issueDate",
        "validUntil",
        "subtotal",
        "discount",
        "tax",
        "total",
        "notes",
        "terms",
        "status",
        "sentAt",
        "acceptedAt",
        "acceptedById",
        "rejectedAt",
        "rejectedById",
        "frozenAt",
        "sellerSnapshot",
        "customerSnapshot",
        "editVersion",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById",
      ].sort(),
    );
  });

  it("is safe to JSON.stringify", () => {
    expect(() => JSON.stringify(toQuotationSummaryDto(makeRow(), "2026-03-15"))).not.toThrow();
  });
});

describe("toQuotationDto", () => {
  it("carries every summary field plus converted items", () => {
    const dto = toQuotationDto(makeRow(), [makeItemRow()], "2026-03-15");
    expect(dto.id).toBe("quo_1");
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

  it("preserves item ordering and multiple items", () => {
    const dto = toQuotationDto(
      makeRow(),
      [makeItemRow({ id: "item_1", sortOrder: 0 }), makeItemRow({ id: "item_2", sortOrder: 1, description: "NVR 16CH" })],
      "2026-03-15",
    );
    expect(dto.items.map((item) => item.id)).toEqual(["item_1", "item_2"]);
  });

  it("is safe to JSON.stringify with items included", () => {
    expect(() => JSON.stringify(toQuotationDto(makeRow(), [makeItemRow()], "2026-03-15"))).not.toThrow();
  });
});
