import Link from "next/link";
import { MoneyFigure, smoothPath } from "@/components/ui/kpi";
import { formatDate, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { DEAL_STAGE } from "@/lib/labels";
import { TREND_STAGES, type DashboardTrendsDto } from "@/server/dashboard/trends";

export const CHART_RANGES = [7, 30, 90] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export type ChartMetric = "value" | "count";

const W = 1000;
const H = 280;
const BOTTOM = 24;

/** Prototype chart card: active pipeline by stage, stacked, over 7, 30 or 90 days. */
export function PipelineChart({ trends, range, metric }: { trends: DashboardTrendsDto; range: ChartRange; metric: ChartMetric }) {
  if (!trends.stages) return null;
  const stages = trends.stages;
  const n = trends.days.length;
  const totals = trends.days.map((_, i) => TREND_STAGES.reduce((sum, stage) => sum + stages[stage][metric][i]!, 0));
  const last = totals[n - 1] ?? 0;
  const first = totals[0] ?? 0;
  const change = first ? Math.round(((last - first) / first) * 100) : null;
  const max = Math.max(1, ...totals) * 1.08;
  const x = (i: number) => (n === 1 ? 0 : (i * W) / (n - 1));
  const y = (v: number) => H - BOTTOM - (v / max) * (H - BOTTOM - 8);

  // Each band runs along its own top, then back along the band below it.
  const below = trends.days.map(() => 0);
  const bands = TREND_STAGES.map((stage) => {
    const base = [...below];
    const top = base.map((v, i) => v + stages[stage][metric][i]!);
    top.forEach((v, i) => (below[i] = v));
    const upper = smoothPath(top.map((v, i) => [x(i), y(v)]));
    const lower = smoothPath(base.map((v, i): [number, number] => [x(i), y(v)]).reverse()).replace(/^M/, "L");
    return { stage, d: `${upper}${lower}Z`, line: upper };
  });
  const ticks = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1];
  const href = (changes: { range?: number; metric?: ChartMetric }) => `/dashboard?range=${changes.range ?? range}&metric=${changes.metric ?? metric}#pipeline-chart`;

  return (
    <section className="chart-card" id="pipeline-chart" aria-label="Grafik pipeline per tahap">
      <div className="chart-top">
        <div>
          <div className="t">
            {metric === "value" ? "Nilai pipeline aktif" : "Jumlah deal aktif"}, {range} hari terakhir
          </div>
          <div className="chart-big" title={metric === "value" ? formatRupiah(String(last)) : undefined}>
            <span>{metric === "value" ? <MoneyFigure value={String(last)} /> : `${last} deal`}</span>
            {change === null ? null : <span className={change < 0 ? "delta neg" : change === 0 ? "delta flat" : "delta"}>{`${change < 0 ? "↓" : change > 0 ? "↑" : "·"} ${Math.abs(change)}%`}</span>}
          </div>
        </div>
        <div className="chart-segs">
          <nav className="segl" aria-label="Rentang waktu">
            {CHART_RANGES.map((value) => (
              <Link key={value} href={href({ range: value })} aria-current={value === range ? "true" : undefined} scroll={false}>
                {value}h
              </Link>
            ))}
          </nav>
          <nav className="segl" aria-label="Metrik">
            <Link href={href({ metric: "value" })} aria-current={metric === "value" ? "true" : undefined} scroll={false}>
              Nilai
            </Link>
            <Link href={href({ metric: "count" })} aria-current={metric === "count" ? "true" : undefined} scroll={false}>
              Jumlah deal
            </Link>
          </nav>
        </div>
      </div>
      <div className="area">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Pipeline per tahap, ${formatDate(trends.days[0]!)} sampai ${formatDate(trends.days[n - 1]!)}`}>
          {[0.25, 0.5, 0.75].map((share) => (
            <line key={share} x1="0" x2={W} y1={y(max * share)} y2={y(max * share)} stroke="var(--border-divider)" vectorEffect="non-scaling-stroke" />
          ))}
          {bands.map((band) => (
            <path key={band.stage} d={band.d} fill={`var(--stage-${band.stage})`} fillOpacity=".85" />
          ))}
          {bands.map((band) => (
            <path key={`${band.stage}-line`} d={band.line} fill="none" stroke="var(--neutral-0)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="chart-axis-dates" aria-hidden="true">
        {ticks.map((tick, index) => (
          <span key={`${tick}-${index}`}>{formatDate(trends.days[tick]!).replace(/ \d{4}$/, "")}</span>
        ))}
      </div>
      <div className="area-legend">
        {TREND_STAGES.map((stage) => (
          <span key={stage}>
            <i style={{ background: `var(--stage-${stage})` }} />
            {DEAL_STAGE[stage].label}{" "}
            <b>{metric === "value" ? formatRupiahCompact(String(stages[stage].value[n - 1] ?? 0)) : `${stages[stage].count[n - 1]} deal`}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
