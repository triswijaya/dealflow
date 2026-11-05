import { ImageResponse } from "next/og";

// The card shown when the landing page link is shared (WhatsApp, LinkedIn, Slack...).
export const alt = "DealFlow: dari chat pertama sampai uang masuk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#F7F8FA", color: "#14161B" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* The app mark (src/components/brand.tsx): an ink tile with three bars of falling height. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "13px 12px", width: 64, height: 64, background: "#14161B", borderRadius: 18 }}>
            <div style={{ width: 9, height: 24, background: "#FFFFFF", borderRadius: 3 }} />
            <div style={{ width: 9, height: 32, background: "rgba(255,255,255,.75)", borderRadius: 3 }} />
            <div style={{ width: 9, height: 16, background: "rgba(255,255,255,.5)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 500, letterSpacing: -1 }}>dealflow</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 600, lineHeight: 1, letterSpacing: -3.5, display: "flex", flexWrap: "wrap" }}>
            <span style={{ marginRight: 20, color: "#868C97" }}>Dari chat pertama sampai</span>
            <span>uang masuk.</span>
          </div>
          <div style={{ fontSize: 30, color: "#656B76" }}>Customer, deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur.</div>
        </div>
      </div>
    ),
    size,
  );
}
