import { describe, expect, it } from "vitest";
import { followUpBucket } from "./follow-up-bucket";

// Asia/Jakarta is UTC+7 with no DST, a useful non-UTC zone for proving the
// bucket follows the organization's local date, not the instant's UTC date.
const TZ = "Asia/Jakarta";

describe("followUpBucket", () => {
  it("is TODAY when the local date matches todayOrg", () => {
    expect(followUpBucket(new Date("2026-09-19T02:00:00Z"), TZ, "2026-09-19")).toBe("TODAY");
  });

  it("is OVERDUE when the local date is before todayOrg", () => {
    expect(followUpBucket(new Date("2026-09-18T02:00:00Z"), TZ, "2026-09-19")).toBe("OVERDUE");
  });

  it("is UPCOMING when the local date is after todayOrg", () => {
    expect(followUpBucket(new Date("2026-09-20T02:00:00Z"), TZ, "2026-09-19")).toBe("UPCOMING");
  });

  it("an hour already past today still buckets as TODAY, not OVERDUE (FUP-03)", () => {
    // 2026-09-19T01:00:00Z is 2026-09-19 08:00 in Asia/Jakarta -- earlier
    // today, not yesterday.
    expect(followUpBucket(new Date("2026-09-19T01:00:00Z"), TZ, "2026-09-19")).toBe("TODAY");
  });

  it("follows the organization's local date across a UTC day boundary", () => {
    // 2026-09-19T18:00:00Z is 2026-09-20 01:00 in Asia/Jakarta (UTC+7):
    // already tomorrow locally, even though the UTC calendar date is still
    // the 19th.
    expect(followUpBucket(new Date("2026-09-19T18:00:00Z"), TZ, "2026-09-19")).toBe("UPCOMING");
  });
});
