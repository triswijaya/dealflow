import { describe, expect, it } from "vitest";
import { effectiveQuotationStatus } from "./effective-status";

describe("effectiveQuotationStatus", () => {
  it("is not expired exactly on validUntil (QUO-10: 'tepat pada valid_until quotation belum expired')", () => {
    expect(effectiveQuotationStatus({ status: "SENT", validUntil: "2026-10-19" }, "2026-10-19")).toBe("SENT");
  });

  it("becomes EXPIRED the day after validUntil", () => {
    expect(effectiveQuotationStatus({ status: "SENT", validUntil: "2026-10-19" }, "2026-10-20")).toBe("EXPIRED");
  });

  it("is not expired before validUntil", () => {
    expect(effectiveQuotationStatus({ status: "SENT", validUntil: "2026-10-19" }, "2026-10-01")).toBe("SENT");
  });

  it("only overlays SENT -- a late DRAFT stays DRAFT, not EXPIRED (QUO-10)", () => {
    expect(effectiveQuotationStatus({ status: "DRAFT", validUntil: "2026-10-19" }, "2026-11-01")).toBe("DRAFT");
  });

  it("never overlays a decided quotation, even past validUntil", () => {
    expect(effectiveQuotationStatus({ status: "ACCEPTED", validUntil: "2026-10-19" }, "2026-11-01")).toBe(
      "ACCEPTED",
    );
    expect(effectiveQuotationStatus({ status: "REJECTED", validUntil: "2026-10-19" }, "2026-11-01")).toBe(
      "REJECTED",
    );
  });
});
