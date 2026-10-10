import { ImageResponse } from "next/og";

// The brand mark (deep green tile, lime pipeline bars) as the favicon.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 5, padding: "14px 13px", background: "#163B2E", borderRadius: 16 }}>
        <div style={{ width: 11, height: 36, background: "#C6F135", borderRadius: 3 }} />
        <div style={{ width: 11, height: 26, background: "#C6F135", borderRadius: 3 }} />
        <div style={{ width: 11, height: 18, background: "#C6F135", borderRadius: 3 }} />
      </div>
    ),
    size,
  );
}
