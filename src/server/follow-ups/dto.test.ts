import { describe, expect, it } from "vitest";
import { toActiveFollowUpDto, toFollowUpDto } from "./dto";

function makeRow(overrides: Partial<Parameters<typeof toFollowUpDto>[0]> = {}) {
  return {
    id: "fup_1",
    organizationId: "org_1",
    dealId: "deal_1",
    type: "WHATSAPP",
    note: "Kirim ulang penawaran",
    followUpAt: new Date("2026-03-10T02:00:00.000Z"),
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: new Date("2026-03-01T01:00:00.000Z"),
    updatedAt: new Date("2026-03-01T01:00:00.000Z"),
    createdById: "user_1",
    updatedById: null,
    ...overrides,
  };
}

describe("toFollowUpDto", () => {
  it("maps every field, converting timestamps to ISO strings", () => {
    expect(toFollowUpDto(makeRow())).toEqual({
      id: "fup_1",
      organizationId: "org_1",
      dealId: "deal_1",
      type: "WHATSAPP",
      note: "Kirim ulang penawaran",
      followUpAt: "2026-03-10T02:00:00.000Z",
      completedAt: null,
      version: 1,
      createdAt: "2026-03-01T01:00:00.000Z",
      updatedAt: "2026-03-01T01:00:00.000Z",
      createdById: "user_1",
      updatedById: null,
    });
  });

  it("converts a set completedAt instead of leaving it null", () => {
    const dto = toFollowUpDto(makeRow({ completedAt: new Date("2026-03-05T03:00:00.000Z") }));
    expect(dto.completedAt).toBe("2026-03-05T03:00:00.000Z");
  });

  it("never leaks a field beyond the declared DTO shape", () => {
    const dto = toFollowUpDto(makeRow());
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "dealId",
        "type",
        "note",
        "followUpAt",
        "completedAt",
        "version",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById",
      ].sort(),
    );
  });

  it("is safe to JSON.stringify", () => {
    expect(() => JSON.stringify(toFollowUpDto(makeRow()))).not.toThrow();
  });
});

describe("toActiveFollowUpDto", () => {
  it("carries every base field plus the read-time bucket", () => {
    const dto = toActiveFollowUpDto(makeRow(), "OVERDUE");
    expect(dto.bucket).toBe("OVERDUE");
    expect(dto.id).toBe("fup_1");
    expect(dto.followUpAt).toBe("2026-03-10T02:00:00.000Z");
  });

  it("never leaks a field beyond the declared DTO shape", () => {
    const dto = toActiveFollowUpDto(makeRow(), "TODAY");
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "dealId",
        "type",
        "note",
        "followUpAt",
        "completedAt",
        "version",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById",
        "bucket",
      ].sort(),
    );
  });
});
