import { ImageResponse } from "next/og";

// The card shown when the landing page link is shared (WhatsApp, LinkedIn, Slack...). It repeats the
// hero: the ink ground, the promise in white, and the facts line underneath.
export const alt = "DealFlow: dari chat pertama sampai uang masuk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#14161B", color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* The app mark (src/components/brand.tsx), inverted for the dark ground. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "13px 12px", width: 64, height: 64, background: "#FFFFFF", borderRadius: 16 }}>
            <div style={{ width: 9, height: 24, background: "#14161B", borderRadius: 3 }} />
            <div style={{ width: 9, height: 32, background: "rgba(20,22,27,.75)", borderRadius: 3 }} />
            <div style={{ width: 9, height: 16, background: "rgba(20,22,27,.5)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 500, letterSpacing: -1 }}>dealflow</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 88, fontWeight: 400, lineHeight: 1.05, letterSpacing: -3.5 }}>
            <span>Dari chat pertama</span>
            <span>sampai uang masuk.</span>
          </div>
          <div style={{ fontSize: 30, color: "#AEB3BC" }}>Pipeline, penawaran, termin, invoice, dan pembayaran di satu ruang kerja.</div>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 22, color: "#9A9FA9" }}>
          <span>Rupiah tanpa desimal</span>
          <span>Termin DP dan BAST</span>
          <span>Waktu WIB</span>
          <span>Empat peran</span>
        </div>
      </div>
    ),
    size,
  );
}
