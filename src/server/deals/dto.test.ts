import { describe, expect, it } from "vitest";
import { toDealDto } from "./dto";

function makeRow(overrides: Partial<Parameters<typeof toDealDto>[0]> = {}) {
  return {
    id: "deal_1",
    organizationId: "org_1",
    customerId: "cus_1",
    title: "Pemasangan CCTV gudang",
    description: "12 titik kamera, NVR 16 channel",
    notes: null,
    estimatedValue: 54_000_000n,
    status: "NEGOTIATION",
    assignedToId: "user_1",
    expectedCloseDate: "2026-04-01",
    lostReason: null,
    lostNote: null,
    wonAt: null,
    wonValue: null,
    lostAt: null,
    lastActivityAt: new Date("2026-03-01T04:00:00.000Z"),
    onHoldUntil: null,
    onHoldReason: null,
    stageEnteredAt: new Date("2026-02-01T04:00:00.000Z"),
    hasQuotation: true,
    version: 3,
    createdAt: new Date("2026-01-05T01:00:00.000Z"),
    updatedAt: new Date("2026-03-01T04:00:00.000Z"),
    createdById: "user_1",
    updatedById: "user_2",
    ...overrides,
  };
}

describe("toDealDto", () => {
  it("maps every field, converting bigint money fields and timestamps", () => {
    expect(toDealDto(makeRow())).toEqual({
      id: "deal_1",
      organizationId: "org_1",
      customerId: "cus_1",
      title: "Pemasangan CCTV gudang",
      description: "12 titik kamera, NVR 16 channel",
      notes: null,
      estimatedValue: "54000000",
      status: "NEGOTIATION",
      assignedToId: "user_1",
      expectedCloseDate: "2026-04-01",
      lostReason: null,
      lostNote: null,
      wonAt: null,
      wonValue: null,
      lostAt: null,
      lastActivityAt: "2026-03-01T04:00:00.000Z",
      onHoldUntil: null,
      onHoldReason: null,
      hasQuotation: true,
      version: 3,
      createdAt: "2026-01-05T01:00:00.000Z",
      updatedAt: "2026-03-01T04:00:00.000Z",
      createdById: "user_1",
      updatedById: "user_2",
    });
  });

  it("converts a WON deal's wonAt/wonValue instead of leaving them null", () => {
    const dto = toDealDto(
      makeRow({
        status: "WON",
        wonAt: new Date("2026-03-10T06:00:00.000Z"),
        wonValue: 54_000_000n,
      }),
    );
    expect(dto.wonAt).toBe("2026-03-10T06:00:00.000Z");
    expect(dto.wonValue).toBe("54000000");
  });

  it("converts a LOST deal's lostAt/lostReason/lostNote", () => {
    const dto = toDealDto(
      makeRow({
        status: "LOST",
        lostAt: new Date("2026-03-12T06:00:00.000Z"),
        lostReason: "PRICE_TOO_HIGH",
        lostNote: "Kompetitor lebih murah 15%",
      }),
    );
    expect(dto.lostAt).toBe("2026-03-12T06:00:00.000Z");
    expect(dto.lostReason).toBe("PRICE_TOO_HIGH");
    expect(dto.lostNote).toBe("Kompetitor lebih murah 15%");
  });

  it("stays exact at the MONEY-04 ceiling", () => {
    const dto = toDealDto(makeRow({ estimatedValue: 1_000_000_000_000_000n }));
    expect(dto.estimatedValue).toBe("1000000000000000");
  });

  it("never leaks a field beyond the declared DTO shape", () => {
    const dto = toDealDto(makeRow());
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "customerId",
        "title",
        "description",
        "notes",
        "estimatedValue",
        "status",
        "assignedToId",
        "expectedCloseDate",
        "lostReason",
        "lostNote",
        "wonAt",
        "wonValue",
        "lostAt",
        "lastActivityAt",
        "onHoldUntil",
        "onHoldReason",
        "hasQuotation",
        "version",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById",
      ].sort(),
    );
  });

  it("is safe to JSON.stringify (no bigint field survives unconverted)", () => {
    expect(() => JSON.stringify(toDealDto(makeRow({ wonValue: 1n, wonAt: new Date() })))).not.toThrow();
  });
});
