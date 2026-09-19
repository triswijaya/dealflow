import { describe, expect, it } from "vitest";
import { buildWhatsAppDeepLink, renderFollowUpMessage } from "./message";

describe("renderFollowUpMessage", () => {
  it("uses the WA-01 quotation template when a quotation number is given", () => {
    const message = renderFollowUpMessage({
      customerName: "Budi Santoso",
      dealTitle: "CCTV Installation - Bekasi",
      quotationNumber: "QT-2026-00001",
    });
    expect(message).toBe(
      [
        "Halo Pak/Bu Budi Santoso,",
        "",
        "izin follow-up terkait quotation QT-2026-00001",
        "untuk CCTV Installation - Bekasi.",
        "",
        "Apakah quotation tersebut sudah sempat direview?",
        "",
        "Terima kasih.",
      ].join("\n"),
    );
  });

  it("falls back to the deal-only template when there is no quotation number (WA-02), with no leftover placeholder", () => {
    const message = renderFollowUpMessage({
      customerName: "Budi Santoso",
      dealTitle: "CCTV Installation - Bekasi",
      quotationNumber: null,
    });
    expect(message).not.toContain("quotation");
    expect(message).not.toContain("{");
    expect(message).toBe(
      [
        "Halo Pak/Bu Budi Santoso,",
        "",
        "izin follow-up terkait CCTV Installation - Bekasi.",
        "",
        "Apakah ada yang bisa kami bantu terkait kebutuhan Bapak/Ibu?",
        "",
        "Terima kasih.",
      ].join("\n"),
    );
  });

  it("also falls back when quotationNumber is omitted entirely", () => {
    const message = renderFollowUpMessage({ customerName: "Budi", dealTitle: "Deal X" });
    expect(message).toContain("izin follow-up terkait Deal X.");
  });
});

describe("buildWhatsAppDeepLink", () => {
  it("builds the WA-01 deep link with URL-encoded text", () => {
    const link = buildWhatsAppDeepLink("628123456789", "Halo Pak/Bu Budi,\n\nizin follow-up.");
    expect(link).toBe(
      "https://wa.me/628123456789?text=" + encodeURIComponent("Halo Pak/Bu Budi,\n\nizin follow-up."),
    );
  });

  it("strips any non-digit formatting from the phone number", () => {
    const link = buildWhatsAppDeepLink("+62 812-3456-789", "hi");
    expect(link).toBe("https://wa.me/628123456789?text=hi");
  });

  it("rejects an empty phone number (WA-03)", () => {
    expect(() => buildWhatsAppDeepLink("", "hi")).toThrow(/phone/i);
    expect(() => buildWhatsAppDeepLink("   ", "hi")).toThrow(/phone/i);
  });
});
