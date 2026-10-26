import { ImageResponse } from "next/og";

// The card shown when the landing page link is shared (WhatsApp, LinkedIn, Slack...).
export const alt = "DealFlow: dari chat pertama sampai uang masuk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#F8F8F8", color: "#141414" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, width: 40, height: 40 }}>
            <div style={{ width: 11, height: 40, background: "#141414", borderRadius: 3 }} />
            <div style={{ width: 11, height: 28, background: "#141414", borderRadius: 3 }} />
            <div style={{ width: 9, height: 18, background: "#141414", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 500, letterSpacing: -1.5 }}>dealflow</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 500, lineHeight: 1, letterSpacing: -3.5, display: "flex", flexWrap: "wrap" }}>
            <span style={{ marginRight: 20, color: "#8A8A8A" }}>Dari chat pertama sampai</span>
            <span>uang masuk.</span>
          </div>
          <div style={{ fontSize: 30, color: "#6B6B6B" }}>Customer, deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur.</div>
        </div>
      </div>
    ),
    size,
  );
}
