import Link from "next/link";
import { formatRupiahCompact } from "@/lib/format";

/** Smooth line through points that never overshoots between them (horizontal tangents). */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(points[0]![0])},${f(points[0]![1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const dx = (x1 - x0) / 2;
    d += `C${f(x0 + dx)},${f(y0)} ${f(x1 - dx)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** "Rp726,6 jt" split so the units can be set small, as in the prototype. */
export function MoneyFigure({ value }: { value: string }) {
  const text = formatRupiahCompact(value);
  const match = /^Rp(.+?)(?: (jt|M|T))?$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className="unit pre">Rp</span>
      {match[1]}
      {match[2] ? <span className="unit post">{match[2]}</span> : null}
    </>
  );
}

/** A soft area and a 2px line along the card's bottom edge. */
export function Sparkline({ series, color, id }: { series: number[]; color: string; id: string }) {
  if (series.length < 2) return null;
  const W = 360;
  const H = 72;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const low = min - (max - min) * 0.18;
  const points = series.map((value, index): [number, number] => [(index * W) / (series.length - 1), H - 8 - ((value - low) / (max - low || 1)) * (H - 24)]);
  const line = smoothPath(points);
  return (
    <svg className="sp" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export type KpiProps = {
  id: string;
  label: string;
  color: string;
  value: React.ReactNode;
  delta?: { text: string; tone?: "up" | "neg" | "flat" };
  note: string;
  series: number[] | null;
  href: string;
  /** Exact value on hover when the card abbreviates it. */
  hint?: string;
};

/** Dashboard KPI card from the final prototype. */
export function KpiCard({ id, label, color, value, delta, note, series, href, hint }: KpiProps) {
  return (
    <Link className="kpi" href={href} title={hint}>
      <div className="kpi-lbl">
        <i style={{ background: color }} />
        {label}
      </div>
      <div className="kpi-val">
        <span className="kpi-num">{value}</span>
        {delta ? <span className={delta.tone && delta.tone !== "up" ? `delta ${delta.tone}` : "delta"}>{delta.text}</span> : null}
      </div>
      <div className="kpi-vs">{note}</div>
      {series ? <Sparkline series={series} color={color} id={`sp-${id}`} /> : null}
    </Link>
  );
}
