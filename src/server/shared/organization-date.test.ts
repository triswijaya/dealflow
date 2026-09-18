import { describe, expect, it } from "vitest";
import { organizationDateString, organizationYear } from "./organization-date";

describe("organizationDateString", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(organizationDateString("Asia/Jakarta", new Date("2026-06-15T04:00:00Z"))).toBe("2026-06-15");
  });

  it("rolls over to the next local day ahead of UTC midnight (Jakarta is UTC+7)", () => {
    // 23:30 UTC on Jan 1 is already 06:30 on Jan 2 in Jakarta.
    expect(organizationDateString("Asia/Jakarta", new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
    // 16:30 UTC on Jan 1 is still 23:30 on Jan 1 in Jakarta.
    expect(organizationDateString("Asia/Jakarta", new Date("2026-01-01T16:30:00Z"))).toBe("2026-01-01");
  });

  it("stays on the previous local day behind UTC midnight (New York is UTC-5 in January)", () => {
    // 04:30 UTC on Jan 1 is still 23:30 on Dec 31 in New York.
    expect(organizationDateString("America/New_York", new Date("2026-01-01T04:30:00Z"))).toBe("2025-12-31");
  });

  it("throws on an unrecognized IANA timezone name rather than silently defaulting", () => {
    expect(() => organizationDateString("Not/AZone", new Date())).toThrow();
  });
});

describe("organizationYear", () => {
  it("reads the year from the organization's local date, not the UTC date (QUO-04)", () => {
    // At this UTC instant it is already Jan 1, 2027 in Jakarta.
    expect(organizationYear("Asia/Jakarta", new Date("2026-12-31T18:00:00Z"))).toBe(2027);
  });

  it("keeps the prior year where local time has not crossed the boundary yet", () => {
    expect(organizationYear("America/New_York", new Date("2027-01-01T02:00:00Z"))).toBe(2026);
  });
});
