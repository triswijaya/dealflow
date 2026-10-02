import { describe, expect, it } from "vitest";
import { instantToZonedLocal, zonedLocalToInstant } from "./format";

describe("zoned wall-clock conversion", () => {
  it("reads a datetime-local value in the organization's timezone, not the machine's", () => {
    // Asia/Jakarta is UTC+7 all year.
    expect(zonedLocalToInstant("2026-09-27T09:30", "Asia/Jakarta").toISOString()).toBe("2026-09-27T02:30:00.000Z");
    expect(zonedLocalToInstant("2026-09-27T00:15", "Asia/Jakarta").toISOString()).toBe("2026-09-26T17:15:00.000Z");
    expect(zonedLocalToInstant("2026-09-27T09:30", "Asia/Jayapura").toISOString()).toBe("2026-09-27T00:30:00.000Z");
  });

  it("round-trips through the field representation", () => {
    for (const local of ["2026-01-01T00:00", "2026-09-27T09:30", "2026-12-31T23:59"]) {
      expect(instantToZonedLocal(zonedLocalToInstant(local, "Asia/Jakarta"), "Asia/Jakarta")).toBe(local);
    }
  });

  it("handles a zone with daylight saving on both sides of the change", () => {
    // New York: UTC-5 in winter, UTC-4 after 8 March 2026.
    expect(zonedLocalToInstant("2026-03-01T12:00", "America/New_York").toISOString()).toBe("2026-03-01T17:00:00.000Z");
    expect(zonedLocalToInstant("2026-03-15T12:00", "America/New_York").toISOString()).toBe("2026-03-15T16:00:00.000Z");
  });

  it("returns an invalid date for text that is not a local datetime", () => {
    expect(Number.isNaN(zonedLocalToInstant("tomorrow", "Asia/Jakarta").getTime())).toBe(true);
  });
});
