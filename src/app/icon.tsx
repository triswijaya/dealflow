import { ImageResponse } from "next/og";

// The brand mark (ink tile, three pipeline bars) as the favicon. Same geometry as
// BrandMark in src/components/brand.tsx, drawn at 2x on a 64px canvas.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const bars = [
  { left: 15, height: 24, opacity: 1 },
  { left: 27.5, height: 32, opacity: 0.75 },
  { left: 40, height: 16, opacity: 0.5 },
];

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#14161B", borderRadius: 18 }}>
        {bars.map((bar) => (
          <div key={bar.left} style={{ position: "absolute", top: 16, left: bar.left, width: 9, height: bar.height, background: "#FFFFFF", borderRadius: 3.2, opacity: bar.opacity }} />
        ))}
      </div>
    ),
    size,
  );
}
