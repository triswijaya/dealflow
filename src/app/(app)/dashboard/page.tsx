import type { Metadata } from "next";
import { headers } from "next/headers";
import { Banknote, CalendarClock, CalendarDays, Handshake, Receipt, TriangleAlert, Trophy, type LucideIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { MetricCard, type Hue } from "@/components/ui/stat";
import { formatDate, firstName, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { one } from "@/lib/url";
import { getPipelineMetrics, getWonThisMonth } from "@/server/dashboard/dashboard";
import { countTodayCustomers, getFollowUpCounts } from "@/server/follow-ups/follow-up-views";
import { getInvoiceSummary, getReceivedThisMonth } from "@/server/invoices/invoice-views";
import { requireWorkspace } from "../workspace";
import { AgendaWidget, CloserWidget, FeedWidget, NearestDueWidget, PipelineWidget, ReadyToInvoiceWidget, RecentPaymentsWidget } from "./widgets";

export const metadata: Metadata = { title: "Ringkasan · DealFlow" };

// Tiles show "Rp134,25 jt" as in the design; the title attribute keeps the exact value.
const amount = (value: string) => formatRupiahCompact(value);

// A KPI whose read fails shows a dash and a retry hint instead of taking the page down.
async function safe<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Dashboard metric failed", error);
    return null;
  }
}

type Kpi = { key: string; label: string; value: string; note: string; href: string; title?: string };

// Each metric keeps its category colour everywhere: deals indigo, won mint, money owed butter, overdue coral, follow-ups violet.
const METRIC_LOOK: Record<string, { icon: LucideIcon; hue: Hue }> = {
  pipeline: { icon: Handshake, hue: "indigo" },
  won: { icon: Trophy, hue: "mint" },
  outstanding: { icon: Receipt, hue: "butter" },
  overdue: { icon: TriangleAlert, hue: "coral" },
  received: { icon: Banknote, hue: "mint" },
  followups: { icon: CalendarClock, hue: "violet" },
};

function Metric({ kpi }: { kpi: Kpi }) {
  const look = METRIC_LOOK[kpi.key];
  return <MetricCard icon={look.icon} hue={look.hue} title={kpi.label} value={kpi.value} label={kpi.note} href={kpi.href} hint={kpi.title} />;
}

function Widget({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const workspace = await requireWorkspace();
  const { agenda } = await searchParams;
  const requestHeaders = await headers();
  const role = workspace.role;
  const finance = role === "FINANCE";
  const seesInvoices = role === "OWNER" || role === "ADMIN" || finance;
  const seesSales = !finance;
  const timezone = workspace.timezone;

  const [pipeline, won, invoices, followUps, followUpCustomers, received] = await Promise.all([
    seesSales ? safe(() => getPipelineMetrics({ headers: requestHeaders })) : null,
    seesSales ? safe(() => getWonThisMonth({ headers: requestHeaders })) : null,
    seesInvoices ? safe(() => getInvoiceSummary({ headers: requestHeaders })) : null,
    seesSales ? safe(() => getFollowUpCounts({ headers: requestHeaders })) : null,
    seesSales ? safe(() => countTodayCustomers({ headers: requestHeaders })) : null,
    finance ? safe(() => getReceivedThisMonth({ headers: requestHeaders })) : null,
  ]);

  const quiet = "Belum ada aktivitas";
  const kpis: Kpi[] = [];
  if (seesSales) {
    kpis.push({
      key: "pipeline",
      label: "Nilai pipeline aktif",
      value: pipeline ? amount(pipeline.totalValue) : "—",
      note: !pipeline ? "Tidak dapat dimuat" : pipeline.totalCount > 0 ? `${pipeline.totalCount} peluang sedang berjalan` : quiet,
      href: "/pipeline",
      title: pipeline ? formatRupiah(pipeline.totalValue) : undefined,
    });
    kpis.push({
      key: "won",
      label: "Menang bulan ini",
      value: won ? amount(won.value) : "—",
      note: !won ? "Tidak dapat dimuat" : won.count > 0 ? `${won.count} deal menjadi kesepakatan` : quiet,
      href: "/deals?stage=WON",
      title: won ? `Nilai deal yang dimenangkan, bukan uang yang sudah diterima. ${formatRupiah(won.value)}` : undefined,
    });
  }
  if (seesInvoices) {
    kpis.push({
      key: "outstanding",
      label: "Tagihan belum lunas",
      value: invoices ? amount(invoices.outstandingTotal) : "—",
      note: !invoices ? "Tidak dapat dimuat" : invoices.outstandingCount > 0 ? `${invoices.outstandingCount} invoice belum lunas` : quiet,
      href: "/invoices",
      title: invoices ? formatRupiah(invoices.outstandingTotal) : undefined,
    });
    kpis.push({
      key: "overdue",
      label: "Invoice lewat jatuh tempo",
      value: invoices ? amount(invoices.overdueTotal) : "—",
      note: !invoices ? "Tidak dapat dimuat" : invoices.overdueCount > 0 ? `${invoices.overdueCount} invoice terlambat` : "Tidak ada invoice terlambat",
      href: "/invoices?status=OVERDUE",
      title: invoices ? formatRupiah(invoices.overdueTotal) : undefined,
    });
  }
  if (finance) {
    kpis.push({
      key: "received",
      label: "Diterima bulan ini",
      value: received ? amount(received.total) : "—",
      note: !received ? "Tidak dapat dimuat" : received.count > 0 ? `${received.count} pembayaran · uang masuk` : quiet,
      href: "/invoices",
      title: received ? formatRupiah(received.total) : undefined,
    });
  }
  if (seesSales) {
    kpis.push({
      key: "followups",
      label: "Follow-up hari ini",
      value: followUpCustomers === null ? "—" : String(followUpCustomers),
      note: !followUps ? "Tidak dapat dimuat" : followUps.today + followUps.overdue > 0 ? `${followUps.today} agenda · ${followUps.overdue} terlambat` : quiet,
      href: "/follow-ups",
      title: followUpCustomers !== null ? `${followUpCustomers} customer unik` : undefined,
    });
  }

  // Order from the mockups: Owner/Admin see five tiles, Sales three, Finance three.
  const order = finance ? ["outstanding", "overdue", "received"] : role === "SALES" ? ["pipeline", "won", "followups"] : ["pipeline", "won", "outstanding", "overdue", "followups"];
  const tiles = order.map((key) => kpis.find((kpi) => kpi.key === key)!).filter(Boolean);

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
        <div className="metrics">
          {tiles.map((kpi) => (
            <Metric key={kpi.key} kpi={kpi} />
          ))}
        </div>
      )}

      {fresh ? null : finance ? (
        <div className="bleed with-rail" style={{ marginTop: 24 }}>
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
        <div className="bleed with-rail" style={{ marginTop: 24 }}>
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
