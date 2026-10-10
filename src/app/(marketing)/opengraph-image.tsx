import { ImageResponse } from "next/og";

// The card shown when the landing page link is shared (WhatsApp, LinkedIn, Slack...).
export const alt = "DealFlow: dari chat pertama sampai uang masuk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#163B2E", color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, width: 56, height: 56, padding: "11px 10px", background: "#C6F135", borderRadius: 14 }}>
            <div style={{ width: 9, height: 32, background: "#163B2E", borderRadius: 2 }} />
            <div style={{ width: 9, height: 22, background: "#163B2E", borderRadius: 2 }} />
            <div style={{ width: 9, height: 14, background: "#163B2E", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5 }}>dealflow</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3, display: "flex", flexWrap: "wrap" }}>
            <span style={{ marginRight: 20 }}>Dari chat pertama sampai</span>
            <span style={{ color: "#C6F135" }}>uang masuk.</span>
          </div>
          <div style={{ fontSize: 30, color: "#C9D7C5" }}>Customer, deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur.</div>
        </div>
      </div>
    ),
    size,
  );
}
