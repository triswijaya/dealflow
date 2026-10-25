import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityTimeline } from "@/components/domain/activity-timeline";
import { Alert } from "@/components/ui/alert";
import { Avatar, KeyValue } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatRelative, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { DEAL_STAGE, INVOICE_STATUS, paymentMethodLabel } from "@/lib/labels";
import { getPipelineMetrics } from "@/server/dashboard/dashboard";
import { listDealRows, listRecentActivities } from "@/server/deals/deal-views";
import { getFollowUpCounts, listFollowUpRows } from "@/server/follow-ups/follow-up-views";
import { listInvoiceableDeals, listNearestDueInvoices, listRecentPayments } from "@/server/invoices/invoice-views";
import { FollowUpItem } from "../follow-ups/follow-up-item";
import { WidgetError } from "./widget-error";

// Each widget reads on its own and answers for itself: when one read fails it
// shows its own error and retry, and the others still render.

async function guard<T>(title: string, read: () => Promise<T>, render: (value: T) => ReactNode): Promise<ReactNode> {
  try {
    return render(await read());
  } catch (error) {
    // Redirects and not-found are control flow, not failures.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error(`Dashboard widget "${title}" failed`, error);
    return <WidgetError title={title} />;
  }
}

export async function PipelineWidget() {
  return guard(
    "Perjalanan peluang",
    async () => getPipelineMetrics({ headers: await headers() }),
    (metrics) => {
      const max = metrics.stages.reduce((largest, stage) => (BigInt(stage.value) > largest ? BigInt(stage.value) : largest), 0n);
      const negotiating = metrics.stages.find((stage) => stage.status === "NEGOTIATION");
      return (
        <Card>
          <CardHeading
            title="Perjalanan peluang"
            description="Nilai deal aktif di lima tahap penjualan"
            action={
              <ButtonLink variant="tertiary" href="/pipeline">
                Buka pipeline
              </ButtonLink>
            }
          />
          <div className="chart-summary">
            <div>
              <strong>{metrics.totalCount}</strong>
              <span>Deal aktif</span>
            </div>
            <div>
              <strong title={formatRupiah(metrics.totalValue)}>{formatRupiahCompact(metrics.totalValue)}</strong>
              <span>
                <i className="legend-dot" aria-hidden="true" />
                Nilai pipeline
              </span>
            </div>
          </div>
          <div className="chart">
            {metrics.stages.map((stage) => {
              const height = max === 0n ? 12 : Math.max(12, Number((BigInt(stage.value) * 100n) / max));
              return (
                <Link key={stage.status} className="bar" href="/pipeline" title={`${DEAL_STAGE[stage.status].label}: ${stage.count} deal · ${formatRupiah(stage.value)}`}>
                  <b>{formatRupiahCompact(stage.value)}</b>
                  <i style={{ height: `${height}%`, ["--mobile" as string]: `${height}%` }}>{stage.count}</i>
                  <small>{DEAL_STAGE[stage.status].label}</small>
                </Link>
              );
            })}
          </div>
          {negotiating && negotiating.count > 0 ? (
            <Link className="chart-foot" href="/deals?stage=NEGOTIATION">
              {negotiating.count} peluang sedang dinegosiasikan · {formatRupiah(negotiating.value)} →
            </Link>
          ) : (
            <span className="chart-foot">Belum ada peluang di tahap negosiasi.</span>
          )}
        </Card>
      );
    },
  );
}

const AGENDA_TABS = [
  { key: "hari-ini", tab: "TODAY", label: "Hari ini", count: "today" },
  { key: "terlambat", tab: "OVERDUE", label: "Terlambat", count: "overdue" },
  { key: "mendatang", tab: "UPCOMING", label: "Mendatang", count: "upcoming" },
] as const;

export async function AgendaWidget({ agenda, timezone, today }: { agenda: string | undefined; timezone: string; today: string }) {
  const current = AGENDA_TABS.find((candidate) => candidate.key === agenda) ?? AGENDA_TABS[0];
  return guard(
    "Agenda follow-up",
    async () => {
      const requestHeaders = await headers();
      const [counts, list] = await Promise.all([
        getFollowUpCounts({ headers: requestHeaders }),
        listFollowUpRows({ headers: requestHeaders, tab: current.tab, pageSize: 4 }),
      ]);
      return { counts, rows: list.items };
    },
    ({ counts, rows }) => (
      <Card className="dashboard-agenda">
        <CardHeading
          title="Agenda follow-up"
          action={
            <ButtonLink variant="tertiary" href="/follow-ups">
              Lihat semua
            </ButtonLink>
          }
        />
        <div>
          <div className="chips">
            {AGENDA_TABS.map((tab) => (
              <ChipLink key={tab.key} href={tab.key === "hari-ini" ? "/dashboard" : `/dashboard?agenda=${tab.key}`} active={tab.key === current.key}>
                {tab.label} ({counts[tab.count]})
              </ChipLink>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: "16px 0 4px" }}>
            {current.tab === "TODAY" ? "Tidak ada follow-up hari ini. Tetap produktif!" : current.tab === "OVERDUE" ? "Tidak ada follow-up yang terlambat." : "Belum ada follow-up mendatang."}
          </p>
        ) : (
          rows.map((row) => <FollowUpItem key={row.id} row={row} timezone={timezone} today={today} canAct compact />)
        )}
        {counts.overdue > 0 ? (
          <Alert tone="warning" className="mt">
            <Link href="/follow-ups?tab=terlambat">{counts.overdue} agenda perlu dijadwalkan ulang →</Link>
          </Alert>
        ) : null}
      </Card>
    ),
  );
}

export async function CloserWidget({ timezone }: { timezone: string }) {
  return guard(
    "Selangkah lebih dekat",
    async () => (await listDealRows({ headers: await headers(), pageSize: 1, sort: "lastActivityAt", direction: "desc", filters: { status: "NEGOTIATION" } })).items[0] ?? null,
    (deal) => (
      <Card>
        <CardHeading
          title="Selangkah lebih dekat"
          description="Deal negosiasi dengan aktivitas terbaru"
          action={
            <ButtonLink variant="tertiary" href="/deals">
              Semua deal
            </ButtonLink>
          }
        />
        {deal ? (
          <dl>
            <KeyValue label={deal.customerName}>
              <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
            </KeyValue>
            <KeyValue label="Nilai">{formatRupiah(deal.estimatedValue)}</KeyValue>
            <KeyValue label="Assigned sales">
              <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <Avatar name={deal.assignedToName} />
                {deal.assignedToName}
              </span>
            </KeyValue>
            <KeyValue label="Aktivitas terakhir">
              {formatRelative(deal.lastActivityAt)} · {formatDateTime(deal.lastActivityAt, timezone)}
            </KeyValue>
          </dl>
        ) : (
          <p className="muted">Belum ada peluang di tahap negosiasi. Peluang yang masuk negosiasi akan muncul di sini.</p>
        )}
      </Card>
    ),
  );
}

export async function FeedWidget({ timezone, title = "Kabar dari tim" }: { timezone: string; title?: string }) {
  return guard(
    title,
    async () => listRecentActivities({ headers: await headers(), limit: 6 }),
    (events) => (
      <Card>
        <h2>{title}</h2>
        {events.length === 0 ? <p className="muted">Belum ada aktivitas. Kabar dari tim akan muncul di sini.</p> : <ActivityTimeline events={events} timezone={timezone} showDeal />}
      </Card>
    ),
  );
}

// ---------------------------------------------------------------------------
// Finance

export async function ReadyToInvoiceWidget() {
  return guard(
    "Siap ditagih",
    async () => listInvoiceableDeals({ headers: await headers() }),
    (ready) => (
      <Card>
        <h2>Siap ditagih</h2>
        {ready.length === 0 ? (
          <div>
            <h3>Semua deal menang sudah ditagih</h3>
            <p className="muted">Deal menang yang baru akan muncul di sini sampai invoice diterbitkan.</p>
            <ButtonLink variant="tertiary" href="/invoices">
              Lihat invoice
            </ButtonLink>
          </div>
        ) : (
          <>
            {ready.slice(0, 4).map((deal) => (
              <div key={deal.id} className="follow" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  <h3>{deal.title}</h3>
                  <p>
                    {deal.customerName} · {formatRupiah(deal.wonValue)}
                    {deal.wonAt ? ` · menang ${formatDate(deal.wonAt)}` : ""}
                  </p>
                </div>
                <ButtonLink variant="secondary" href={`/invoices/new?dealId=${deal.id}`}>
                  Buat invoice
                </ButtonLink>
              </div>
            ))}
            {ready.length > 4 ? <small>dan {ready.length - 4} deal lain.</small> : null}
          </>
        )}
      </Card>
    ),
  );
}

export async function NearestDueWidget() {
  return guard(
    "Jatuh tempo terdekat",
    async () => listNearestDueInvoices({ headers: await headers() }),
    (invoices) => (
      <Card>
        <CardHeading
          title="Jatuh tempo terdekat"
          action={
            <ButtonLink variant="tertiary" href="/invoices">
              Semua invoice
            </ButtonLink>
          }
        />
        {invoices.length === 0 ? (
          <p className="muted">Tidak ada tagihan yang menunggu pembayaran.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="num">Sisa</th>
                  <th>Jatuh tempo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const info = INVOICE_STATUS[invoice.status];
                  return (
                    <tr key={invoice.id}>
                      <td data-label="Invoice">
                        <div>
                          <Link href={`/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link>
                        </div>
                      </td>
                      <td data-label="Customer">
                        <div>{invoice.customerName}</div>
                      </td>
                      <td className="num" data-label="Sisa">
                        <div>{formatRupiah(invoice.remainingAmount)}</div>
                      </td>
                      <td data-label="Jatuh tempo">
                        <div>{formatDate(invoice.dueDate)}</div>
                      </td>
                      <td data-label="Status">
                        <div>
                          <Badge tone={info?.tone}>{invoice.status === "OVERDUE" ? "Lewat jatuh tempo" : (info?.label ?? invoice.status)}</Badge>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),
  );
}

export async function RecentPaymentsWidget() {
  return guard(
    "Pembayaran terbaru",
    async () => listRecentPayments({ headers: await headers() }),
    (payments) => (
      <Card>
        <h2>Pembayaran terbaru</h2>
        {payments.length === 0 ? (
          <p className="muted">Belum ada pembayaran tercatat.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal bayar</th>
                  <th>Customer</th>
                  <th className="num">Jumlah</th>
                  <th>Metode</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Tanggal bayar">
                      <div>{formatDate(payment.paymentDate)}</div>
                    </td>
                    <td data-label="Customer">
                      <div>
                        <Link href={`/invoices/${payment.invoiceId}`}>{payment.customerName}</Link>
                      </div>
                    </td>
                    <td className="num" data-label="Jumlah">
                      <div>{formatRupiah(payment.amount)}</div>
                    </td>
                    <td data-label="Metode">
                      <div>{paymentMethodLabel(payment.paymentMethod)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),
  );
}

