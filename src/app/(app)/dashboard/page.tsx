import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Skeleton } from "@/components/ui/misc";
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

type Kpi = { key: string; label: string; value: string; note: string; href: string; title?: string; tone?: "dark" | "lime" };

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <Link className={`kpi${kpi.tone === "dark" ? " is-dark" : kpi.tone === "lime" ? " lime" : ""}`} href={kpi.href} title={kpi.title}>
      <label>{kpi.label}</label>
      <strong>{kpi.value}</strong>
      <small>{kpi.note}</small>
    </Link>
  );
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
      tone: "dark",
    });
    kpis.push({
      key: "won",
      label: "Menang bulan ini",
      value: won ? amount(won.value) : "—",
      note: !won ? "Tidak dapat dimuat" : won.count > 0 ? `${won.count} deal menjadi kesepakatan` : quiet,
      href: "/deals?stage=WON",
      title: won ? `Nilai deal yang dimenangkan, bukan uang yang sudah diterima. ${formatRupiah(won.value)}` : undefined,
      tone: "lime",
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
      tone: finance ? "dark" : undefined,
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
      tone: "lime",
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

  const primary = finance ? (
    <ButtonLink href="/invoices/new">Buat invoice</ButtonLink>
  ) : (
    <ButtonLink href="/deals/new">Buat deal</ButtonLink>
  );

  return (
    <>
      <PageHeader
        eyebrow="Ringkasan bisnis"
        title="Ruang untuk bertumbuh&nbsp;✳"
        display
        description={`Halo, ${firstName(workspace.user.name)}. Ini kabar peluang dan percakapan tim hari ini.`}
        actions={
          <>
            <span className="chip">{formatDate(workspace.today)}</span>
            {primary}
          </>
        }
      />

      <div className="kpis" style={{ ["--n" as string]: tiles.length }}>
        {tiles.map((kpi) => (
          <KpiTile key={kpi.key} kpi={kpi} />
        ))}
      </div>

      {fresh ? (
        <div style={{ marginTop: 22 }}>
          <Card>
            <div className="eyebrow">Mulai dari sini</div>
            <h2>Tiga langkah untuk memulai</h2>
            <p className="muted" style={{ margin: "8px 0 18px", maxWidth: 520 }}>
              Ruang kerja Anda masih kosong. Mulai dari customer pertama, lalu buat peluangnya, dan ajak tim bergabung.
            </p>
            <div className="row">
              <ButtonLink href="/customers">Tambah customer pertama</ButtonLink>
              <ButtonLink variant="secondary" href="/deals/new">
                Buat deal pertama
              </ButtonLink>
              {(role === "OWNER" || role === "ADMIN") && isBuilt("/settings/members") ? (
                <ButtonLink variant="tertiary" href="/settings/members">
                  Undang tim
                </ButtonLink>
              ) : null}
            </div>
          </Card>
        </div>
      ) : finance ? (
        <div className="stack" style={{ marginTop: 22 }}>
          <Widget>
            <ReadyToInvoiceWidget />
          </Widget>
          <Widget>
            <NearestDueWidget />
          </Widget>
          <Widget>
            <RecentPaymentsWidget />
          </Widget>
          <Widget>
            <FeedWidget timezone={timezone} />
          </Widget>
        </div>
      ) : (
        <>
          <div className="cols split" style={{ marginTop: 22 }}>
            <Widget>
              <PipelineWidget />
            </Widget>
            <Widget>
              <AgendaWidget agenda={one(agenda)} timezone={timezone} today={workspace.today} />
            </Widget>
          </div>
          <div className="cols g2" style={{ marginTop: 22 }}>
            <Widget>
              <CloserWidget timezone={timezone} />
            </Widget>
            <Widget>
              <FeedWidget timezone={timezone} />
            </Widget>
          </div>
        </>
      )}
    </>
  );
}
