import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarDays } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { KpiCard, MoneyFigure, type KpiProps } from "@/components/ui/kpi";
import { formatDate, firstName, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { one } from "@/lib/url";
import { getPipelineMetrics, getWonThisMonth } from "@/server/dashboard/dashboard";
import { getDashboardTrends, type DashboardTrendsDto } from "@/server/dashboard/trends";
import { getFollowUpCounts } from "@/server/follow-ups/follow-up-views";
import { getInvoiceSummary, getReceivedThisMonth } from "@/server/invoices/invoice-views";
import { logger } from "@/server/shared/logger";
import { requireWorkspace } from "../workspace";
import { CHART_RANGES, PipelineChart, type ChartMetric, type ChartRange } from "./pipeline-chart";
import { AgendaWidget, CloserWidget, FeedWidget, NearestDueWidget, PipelineWidget, ReadyToInvoiceWidget, RecentPaymentsWidget } from "./widgets";

export const metadata: Metadata = { title: "Ringkasan · DealFlow" };

// A KPI whose read fails shows a dash and a retry hint instead of taking the page down.
async function safe<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    logger.error("dashboard.metric_failed", { error });
    return null;
  }
}

const pct = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 100n) / whole));
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
const arrow = (value: number) => `${value < 0 ? "↓" : "↑"} ${Math.abs(value)}%`;
/** The sparkline is always the last 30 days, whatever range the chart shows. */
const last30 = (series: number[] | undefined | null) => (series ? series.slice(-30) : null);

function sliceStages(stages: NonNullable<DashboardTrendsDto["stages"]>, days: number) {
  return Object.fromEntries(Object.entries(stages).map(([stage, series]) => [stage, { value: series.value.slice(-days), count: series.count.slice(-days) }])) as NonNullable<DashboardTrendsDto["stages"]>;
}

function Widget({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const workspace = await requireWorkspace();
  const { agenda, range: rangeParam, metric: metricParam } = await searchParams;
  const range: ChartRange = CHART_RANGES.find((value) => String(value) === one(rangeParam)) ?? 30;
  const metric: ChartMetric = one(metricParam) === "count" ? "count" : "value";
  const requestHeaders = await headers();
  const role = workspace.role;
  const finance = role === "FINANCE";
  const seesInvoices = role === "OWNER" || role === "ADMIN" || finance;
  const seesSales = !finance;
  const timezone = workspace.timezone;

  const [pipeline, won, invoices, followUps, trends, received] = await Promise.all([
    seesSales ? safe(() => getPipelineMetrics({ headers: requestHeaders })) : null,
    seesSales ? safe(() => getWonThisMonth({ headers: requestHeaders })) : null,
    seesInvoices ? safe(() => getInvoiceSummary({ headers: requestHeaders })) : null,
    seesSales ? safe(() => getFollowUpCounts({ headers: requestHeaders })) : null,
    safe((): Promise<DashboardTrendsDto> => getDashboardTrends({ headers: requestHeaders, days: Math.max(range, 30) })),
    finance ? safe(() => getReceivedThisMonth({ headers: requestHeaders })) : null,
  ]);

  const failed = "Tidak dapat dimuat";
  const dash = "—";
  const stageTotal = (i: number) => (trends?.stages ? trends.stages.PROPOSAL.value[i]! + trends.stages.NEGOTIATION.value[i]! + trends.stages.COMMITMENT.value[i]! : 0);
  const pipelineSeries = trends?.stages ? trends.days.map((_, i) => stageTotal(i)).slice(-30) : null;
  const pipelineChange = pipelineSeries ? change(pipelineSeries.at(-1)!, pipelineSeries[0]!) : null;
  const wonChange = won && trends?.won ? change(Number(won.value), Number(trends.won.lastMonth)) : null;

  const cards: Record<string, KpiProps> = {
    pipeline: {
      id: "pipeline",
      label: "Nilai pipeline aktif",
      color: "var(--cat-store)",
      value: pipeline ? <MoneyFigure value={pipeline.totalValue} /> : dash,
      delta: pipelineChange === null ? undefined : { text: arrow(pipelineChange), tone: pipelineChange < 0 ? "neg" : "up" },
      note: pipeline ? `${pipeline.totalCount} deal aktif · vs 30 hari lalu` : failed,
      series: pipelineSeries,
      href: "/pipeline",
      hint: pipeline ? formatRupiah(pipeline.totalValue) : undefined,
    },
    won: {
      id: "won",
      label: "Menang bulan ini",
      color: "var(--cat-docs)",
      value: won ? <MoneyFigure value={won.value} /> : dash,
      delta: wonChange === null ? undefined : { text: arrow(wonChange), tone: wonChange < 0 ? "neg" : "up" },
      note: won ? `${won.count} deal · bulan lalu ${formatRupiahCompact(trends?.won?.lastMonth ?? "0")}` : failed,
      series: last30(trends?.won?.series),
      href: "/deals?stage=WON",
      hint: won ? `Nilai deal yang dimenangkan, bukan uang yang sudah diterima. ${formatRupiah(won.value)}` : undefined,
    },
    outstanding: {
      id: "outstanding",
      label: "Tagihan belum lunas",
      color: "var(--cat-billing)",
      value: invoices ? <MoneyFigure value={invoices.outstandingTotal} /> : dash,
      delta: trends?.outstanding ? { text: `${pct(BigInt(trends.outstanding.collected), BigInt(trends.outstanding.billed))}% terkumpul` } : undefined,
      note: invoices ? `${invoices.outstandingCount} invoice · ${formatRupiahCompact(invoices.overdueTotal)} lewat tempo` : failed,
      series: last30(trends?.outstanding?.series),
      href: "/invoices",
      hint: invoices ? formatRupiah(invoices.outstandingTotal) : undefined,
    },
    overdue: {
      id: "overdue",
      label: "Lewat jatuh tempo",
      color: "var(--cat-infra)",
      value: invoices ? <MoneyFigure value={invoices.overdueTotal} /> : dash,
      delta: invoices ? { text: `${invoices.overdueCount} invoice`, tone: invoices.overdueCount > 0 ? "neg" : "flat" } : undefined,
      note: invoices ? (invoices.overdueCount > 0 ? "Perlu ditagih" : "Tidak ada invoice terlambat") : failed,
      series: last30(trends?.outstanding?.overdue),
      href: "/invoices?status=OVERDUE",
      hint: invoices ? formatRupiah(invoices.overdueTotal) : undefined,
    },
    received: {
      id: "received",
      label: "Diterima bulan ini",
      color: "var(--cat-docs)",
      value: received ? <MoneyFigure value={received.total} /> : dash,
      delta: received ? { text: `${received.count} pembayaran`, tone: "flat" } : undefined,
      note: received ? "Uang masuk bulan ini" : failed,
      series: last30(trends?.received),
      href: "/receipts",
      hint: received ? formatRupiah(received.total) : undefined,
    },
    followups: {
      id: "followups",
      label: "Follow-up hari ini",
      color: "var(--cat-infra)",
      value: followUps ? String(followUps.today + followUps.overdue) : dash,
      delta: followUps && followUps.overdue > 0 ? { text: `${followUps.overdue} terlambat`, tone: "neg" } : undefined,
      note: followUps ? `${followUps.upcoming} follow-up mendatang` : failed,
      series: last30(trends?.followUps),
      href: "/follow-ups",
    },
  };

  // Prototype order: Owner/Admin four cards, Sales and Finance three.
  const order = finance ? ["outstanding", "overdue", "received"] : role === "SALES" ? ["pipeline", "won", "followups"] : ["pipeline", "won", "outstanding", "followups"];

  const fresh =
    seesSales &&
    pipeline !== null &&
    pipeline.totalCount === 0 &&
    (won?.count ?? 0) === 0 &&
    (invoices?.outstandingCount ?? 0) === 0 &&
    (followUps ? followUps.today + followUps.overdue + followUps.upcoming + followUps.done === 0 : false);

  // First run: the empty metrics give way to the three things that fill them.
  const steps = [
    { title: "Tambah customer pertama", description: "Simpan perusahaan dan kontak yang sedang Anda ajak bicara.", action: "Tambah customer", href: "/customers" },
    { title: "Buat deal pertama", description: "Catat peluangnya: nilai, tahap, dan siapa yang menangani.", action: "Buat deal", href: "/deals/new" },
    ...((role === "OWNER" || role === "ADMIN") && isBuilt("/settings/members")
      ? [{ title: "Ajak tim bergabung", description: "Undang sales dan finance agar semua bekerja di satu alur.", action: "Undang tim", href: "/settings/members" }]
      : []),
  ];

  const primary = finance ? (
    <ButtonLink href="/invoices/new">Buat invoice</ButtonLink>
  ) : (
    <ButtonLink href="/deals/new">Buat deal</ButtonLink>
  );

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description={`Halo, ${firstName(workspace.user.name)}. Ini kabar peluang dan percakapan tim hari ini.`}
        actions={
          <>
            <span className="chip date-chip">
              <CalendarDays aria-hidden="true" />
              {formatDate(workspace.today)}
            </span>
            {primary}
          </>
        }
      />

      {fresh ? (
        <section className="region">
          <h2>Mulai dalam {steps.length} langkah</h2>
          <p className="muted setup-lead">Ruang kerja {workspace.organization.name} masih kosong. Angka di ringkasan ini muncul begitu deal pertama berjalan.</p>
          <ol className="setup-steps">
            {steps.map((step, index) => (
              <li key={step.title} className="setup-step">
                <span className="step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <ButtonLink variant={index === 0 ? "primary" : "secondary"} href={step.href}>
                  {step.action}
                </ButtonLink>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          <section className={order.length === 3 ? "kpis n3" : "kpis"} aria-label="Ringkasan angka">
            {order.map((key) => (
              <KpiCard key={key} {...cards[key]!} />
            ))}
          </section>
          {seesSales && trends ? <PipelineChart trends={{ ...trends, days: trends.days.slice(-range), stages: trends.stages ? sliceStages(trends.stages, range) : null }} range={range} metric={metric} /> : null}
        </>
      )}

      {fresh ? null : finance ? (
        <div className="bleed with-rail dashboard-grid" style={{ marginTop: 24 }}>
          <div className="rail-main">
            <Widget>
              <NearestDueWidget />
            </Widget>
            <Widget>
              <RecentPaymentsWidget />
            </Widget>
          </div>
          <div className="rail-divider" />
          <div className="rail-side">
            <Widget>
              <ReadyToInvoiceWidget />
            </Widget>
            <Widget>
              <FeedWidget timezone={timezone} />
            </Widget>
          </div>
        </div>
      ) : (
        <div className="bleed with-rail dashboard-grid" style={{ marginTop: 24 }}>
          <div className="rail-main">
            <Widget>
              <PipelineWidget />
            </Widget>
            <Widget>
              <FeedWidget timezone={timezone} />
            </Widget>
          </div>
          <div className="rail-divider" />
          <div className="rail-side">
            <Widget>
              <AgendaWidget agenda={one(agenda)} timezone={timezone} today={workspace.today} />
            </Widget>
            <Widget>
              <CloserWidget timezone={timezone} />
            </Widget>
          </div>
        </div>
      )}
    </>
  );
}
