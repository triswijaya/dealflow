import { describe, expect, it } from "vitest";
import { toCustomerDto } from "./dto";

function makeRow(overrides: Partial<Parameters<typeof toCustomerDto>[0]> = {}) {
  return {
    id: "cus_1",
    organizationId: "org_1",
    companyName: "PT Maju Jaya",
    taxId: "0123456789012345",
    address: "Jl. Sudirman No. 1, Jakarta",
    notes: "Referral dari NusaTech",
    version: 2,
    createdAt: new Date("2026-01-10T02:00:00.000Z"),
    updatedAt: new Date("2026-02-15T09:30:00.000Z"),
    createdById: "user_1",
    updatedById: "user_2",
    ...overrides,
  };
}

const contact = {
  contactId: "con_1",
  contactPerson: "Budi Santoso",
  phoneRaw: "0812-3456-7890",
  phoneNormalized: "6281234567890",
  email: "budi@majujaya.co.id",
};

describe("toCustomerDto", () => {
  it("maps every field, converting timestamps to ISO strings and flattening the primary contact", () => {
    expect(toCustomerDto(makeRow(), contact)).toEqual({
      id: "cus_1",
      organizationId: "org_1",
      companyName: "PT Maju Jaya",
      taxId: "0123456789012345",
      primaryContactId: "con_1",
      contactPerson: "Budi Santoso",
      phoneRaw: "0812-3456-7890",
      phoneNormalized: "6281234567890",
      email: "budi@majujaya.co.id",
      address: "Jl. Sudirman No. 1, Jakarta",
      notes: "Referral dari NusaTech",
      version: 2,
      createdAt: "2026-01-10T02:00:00.000Z",
      updatedAt: "2026-02-15T09:30:00.000Z",
      createdById: "user_1",
      updatedById: "user_2",
    });
  });

  it("passes through null optional fields as null, not undefined", () => {
    const dto = toCustomerDto(makeRow({ taxId: null, address: null, notes: null, updatedById: null }), { ...contact, email: null, phoneRaw: null, phoneNormalized: null });
    expect(dto.taxId).toBeNull();
    expect(dto.email).toBeNull();
    expect(dto.phoneNormalized).toBeNull();
    expect(dto.address).toBeNull();
    expect(dto.notes).toBeNull();
    expect(dto.updatedById).toBeNull();
  });

  it("stays readable when a customer has no primary contact row", () => {
    const dto = toCustomerDto(makeRow(), null);
    expect(dto).toMatchObject({ primaryContactId: null, contactPerson: "", phoneRaw: null, phoneNormalized: null, email: null });
  });

  it("never leaks a field beyond the declared DTO shape", () => {
    const dto = toCustomerDto(makeRow(), contact);
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "organizationId",
        "companyName",
        "taxId",
        "primaryContactId",
        "contactPerson",
        "phoneRaw",
        "phoneNormalized",
        "email",
        "address",
        "notes",
        "version",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById",
      ].sort(),
    );
  });

  it("is safe to JSON.stringify (no bigint/Date field survives unconverted)", () => {
    expect(() => JSON.stringify(toCustomerDto(makeRow(), contact))).not.toThrow();
  });
});
