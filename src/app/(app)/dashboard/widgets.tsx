import { headers } from "next/headers";
import { CalendarClock, ChevronRight, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityTimeline } from "@/components/domain/activity-timeline";
import { Alert } from "@/components/ui/alert";
import { Avatar, EmptyState, KeyValue } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CardHeading } from "@/components/ui/card";
import { formatDate, formatDateTime, formatRelative, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { DEAL_STAGE, INVOICE_STATUS, paymentMethodLabel } from "@/lib/labels";
import { getPipelineMetrics } from "@/server/dashboard/dashboard";
import { logger } from "@/server/shared/logger";
import { listDealRows, listRecentActivities } from "@/server/deals/deal-views";
import { getFollowUpCounts, listFollowUpRows } from "@/server/follow-ups/follow-up-views";
import { listInvoiceableItems, listNearestDueInvoices, listRecentPayments } from "@/server/invoices/invoice-views";
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
    logger.error("dashboard.widget_failed", { widget: title, error });
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
        <section className="region">
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
                  <i style={{ height: `${height}%`, ["--mobile" as string]: `${height}%`, background: `var(--stage-${stage.status})` }} />
                  <small>{DEAL_STAGE[stage.status].label}</small>
                </Link>
              );
            })}
          </div>
          <div className="chart-axis" aria-hidden="true">
            {metrics.stages.map((stage) => (
              <span key={stage.status}>
                {DEAL_STAGE[stage.status].label}
                <small>{stage.count} deal</small>
              </span>
            ))}
          </div>
          {negotiating && negotiating.count > 0 ? (
            <Link className="chart-foot" href="/deals?stage=NEGOTIATION">
              {negotiating.count} peluang sedang dinegosiasikan · {formatRupiah(negotiating.value)} →
            </Link>
          ) : (
            <span className="chart-foot">Belum ada peluang di tahap negosiasi.</span>
          )}
        </section>
      );
    },
  );
}

const AGENDA_TABS = [
  { key: "hari-ini", tab: "TODAY", label: "Hari ini", count: "today" },
  { key: "terlambat", tab: "OVERDUE", label: "Terlambat", count: "overdue" },
  { key: "mendatang", tab: "UPCOMING", label: "Mendatang", count: "upcoming" },
] as const;

const AGENDA_GLYPH = { "hari-ini": Clock, terlambat: TriangleAlert, mendatang: CalendarClock } as const;
const AGENDA_STATUS = { "hari-ini": "warning", terlambat: "danger", mendatang: "pending" } as const;

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
      <section className="region dashboard-agenda">
        <CardHeading
          title="Agenda follow-up"
          action={
            <ButtonLink variant="tertiary" href="/follow-ups">
              Lihat semua
            </ButtonLink>
          }
        />
        <div className="tiles stacked" role="group" aria-label="Pilih agenda">
          {AGENDA_TABS.map((tab) => {
            const Glyph = AGENDA_GLYPH[tab.key];
            const selected = tab.key === current.key;
            return (
              <Link
                key={tab.key}
                className="status-tile"
                data-status={AGENDA_STATUS[tab.key]}
                aria-current={selected ? "true" : undefined}
                href={tab.key === "hari-ini" ? "/dashboard" : `/dashboard?agenda=${tab.key}`}
              >
                <span className="icon-chip">
                  <Glyph aria-hidden="true" />
                </span>
                <span className="tile-text">
                  <strong>{counts[tab.count]}</strong>
                  <small>{tab.label}</small>
                </span>
                <ChevronRight className="chev" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
        {rows.length === 0 ? (
          <AgendaEmpty tab={current.tab} />
        ) : (
          rows.map((row) => <FollowUpItem key={row.id} row={row} timezone={timezone} today={today} canAct compact />)
        )}
        {counts.overdue > 0 ? (
          <Alert tone="warning" className="mt">
            <Link href="/follow-ups?tab=terlambat">{counts.overdue} agenda perlu dijadwalkan ulang →</Link>
          </Alert>
        ) : null}
      </section>
    ),
  );
}

const AGENDA_EMPTY = {
  TODAY: { tone: "success", title: "Agenda hari ini sudah bersih", description: "Tidak ada follow-up yang dijadwalkan hari ini." },
  OVERDUE: { tone: "success", title: "Tidak ada yang terlambat", description: "Semua follow-up masih sesuai jadwal." },
  UPCOMING: { tone: "neutral", title: "Belum ada follow-up mendatang", description: "Jadwalkan percakapan berikutnya dari halaman deal." },
} as const;

function AgendaEmpty({ tab }: { tab: keyof typeof AGENDA_EMPTY }) {
  const empty = AGENDA_EMPTY[tab];
  return <EmptyState size="region" tone={empty.tone} title={empty.title} description={empty.description} />;
}

export async function CloserWidget({ timezone }: { timezone: string }) {
  return guard(
    "Selangkah lebih dekat",
    async () => (await listDealRows({ headers: await headers(), pageSize: 1, sort: "lastActivityAt", direction: "desc", filters: { status: "NEGOTIATION" } })).items[0] ?? null,
    (deal) => (
      <section className="region">
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
          <EmptyState size="region" title="Belum ada deal di tahap negosiasi" description="Deal yang masuk negosiasi akan muncul di sini." />
        )}
      </section>
    ),
  );
}

export async function FeedWidget({ timezone, title = "Kabar dari tim" }: { timezone: string; title?: string }) {
  return guard(
    title,
    async () => listRecentActivities({ headers: await headers(), limit: 6 }),
    (events) => (
      <section className="region">
        <h2>{title}</h2>
        {events.length === 0 ? (
          <EmptyState size="region" title="Belum ada aktivitas" description="Catatan, perubahan tahap, dan dokumen dari tim akan muncul di sini." />
        ) : (
          <ActivityTimeline events={events} timezone={timezone} showDeal />
        )}
      </section>
    ),
  );
}

// ---------------------------------------------------------------------------
// Finance

export async function ReadyToInvoiceWidget() {
  return guard(
    "Siap ditagih",
    async () => listInvoiceableItems({ headers: await headers() }),
    (ready) => (
      <section className="region">
        <h2>Siap ditagih</h2>
        {ready.length === 0 ? (
          <EmptyState
            size="region"
            tone="success"
            title="Semua termin siap sudah ditagih"
            description="Termin yang siap ditagih akan muncul di sini sampai invoice diterbitkan."
            action={
              <ButtonLink variant="tertiary" href="/invoices">
                Lihat invoice
              </ButtonLink>
            }
          />
        ) : (
          <>
            {ready.slice(0, 4).map((deal) => (
              <div key={deal.id} className="follow" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  <h3>{deal.title}</h3>
                  <p>
                    {deal.customerName} · {formatRupiah(deal.amount)} · pesanan {formatDate(deal.commitmentDate)}
                  </p>
                </div>
                <ButtonLink variant="secondary" href={`/invoices/new?billingItemId=${deal.id}`}>
                  Buat invoice
                </ButtonLink>
              </div>
            ))}
            {ready.length > 4 ? <small>dan {ready.length - 4} termin lain.</small> : null}
          </>
        )}
      </section>
    ),
  );
}

export async function NearestDueWidget() {
  return guard(
    "Jatuh tempo terdekat",
    async () => listNearestDueInvoices({ headers: await headers() }),
    (invoices) => (
      <section className="region">
        <CardHeading
          title="Jatuh tempo terdekat"
          action={
            <ButtonLink variant="tertiary" href="/invoices">
              Semua invoice
            </ButtonLink>
          }
        />
        {invoices.length === 0 ? (
          <EmptyState size="region" tone="success" title="Tidak ada tagihan yang menunggu" description="Invoice yang belum lunas akan muncul di sini, diurutkan dari jatuh tempo terdekat." />
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
      </section>
    ),
  );
}

export async function RecentPaymentsWidget() {
  return guard(
    "Pembayaran terbaru",
    async () => listRecentPayments({ headers: await headers() }),
    (payments) => (
      <section className="region">
        <h2>Pembayaran terbaru</h2>
        {payments.length === 0 ? (
          <EmptyState size="region" title="Belum ada pembayaran tercatat" description="Pembayaran yang dicatat di invoice akan muncul di sini." />
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
      </section>
    ),
  );
}

