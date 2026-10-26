import { ImageResponse } from "next/og";

// The card shown when the landing page link is shared (WhatsApp, LinkedIn, Slack...).
export const alt = "DealFlow: dari chat pertama sampai uang masuk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#F7F6F5", color: "#141414" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, width: 52, height: 52, padding: "13px 12px", background: "#141414", borderRadius: 12 }}>
            <div style={{ width: 8, height: 26, background: "#FFFFFF", borderRadius: 2 }} />
            <div style={{ width: 8, height: 18, background: "#FFFFFF", borderRadius: 2 }} />
            <div style={{ width: 8, height: 11, background: "#FFFFFF", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 500, letterSpacing: -1.5 }}>dealflow</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 500, lineHeight: 1, letterSpacing: -3.5, display: "flex", flexWrap: "wrap" }}>
            <span style={{ marginRight: 20 }}>Dari chat pertama sampai</span>
            <span style={{ color: "#2200FF" }}>uang masuk.</span>
          </div>
          <div style={{ fontSize: 30, color: "#666666" }}>Customer, deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur.</div>
        </div>
      </div>
    ),
    size,
  );
}
