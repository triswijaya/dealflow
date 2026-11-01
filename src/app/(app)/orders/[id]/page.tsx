import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DetailHeader, KeyValue } from "@/components/ui/misc";
import { formatDate, formatRupiah } from "@/lib/format";
import { BILLING_STATUS, BILLING_TRIGGERS, ORDER_STATUS, commitmentLabel } from "@/lib/labels";
import { getOrder } from "@/server/orders/orders";
import { load, requireWorkspace } from "../../workspace";
import { MilestoneButton, OrderActions } from "../order-actions";

export const metadata: Metadata = { title: "Detail pesanan · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const share = (part: bigint, whole: bigint) => (whole > 0n ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : 0);

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const workspace = await requireWorkspace();
  const order = await load((headers) => getOrder({ headers, orderId: id }));
  const canInvoice = workspace.role !== "SALES";
  const active = order.status !== "CANCELLED";

  const value = BigInt(order.currentValue);
  const billed = BigInt(order.billedAmount);
  const settled = BigInt(order.settledAmount);
  const live = order.billingItems.filter((item) => item.status !== "CANCELLED");
  const sumOf = (status: string) => live.filter((item) => item.status === status).reduce((sum, item) => sum + BigInt(item.amount), 0n);
  const ready = sumOf("READY");
  const planned = sumOf("PLANNED");
  const planTotal = live.reduce((sum, item) => sum + BigInt(item.amount), 0n);
  const status = ORDER_STATUS[order.status];
  const segments = [
    { amount: settled, color: "var(--status-success-glyph)", label: "Terbayar" },
    { amount: billed - settled, color: "var(--status-info-glyph)", label: "Ditagih, belum lunas" },
    { amount: ready, color: "var(--status-warning-glyph)", label: "Siap ditagih" },
    { amount: planned, color: "var(--neutral-300)", label: "Direncanakan" },
  ];
  const firstReady = live.find((item) => item.status === "READY");

  return (
    <>
      <SetBreadcrumb trail={[order.orderNumber]} />
      <DetailHeader
        backHref="/orders"
        backLabel="Kembali ke daftar pesanan"
        title={order.orderNumber}
        titleClassName="doc-id"
        badge={<Badge tone={status?.tone}>{status?.label ?? order.status}</Badge>}
        description={
          <>
            {order.customerName} · {order.title}
          </>
        }
        actions={
          <>
            {active ? <OrderActions order={order} /> : null}
            {active && canInvoice && firstReady ? <ButtonLink href={`/invoices/new?billingItemId=${firstReady.id}`}>Terbitkan invoice</ButtonLink> : null}
          </>
        }
      />

      {order.cancelledAt ? (
        <Alert tone="error">
          Dibatalkan pada {formatDate(order.cancelledAt, workspace.timezone)}
          {order.cancelReason ? ` · ${order.cancelReason}` : ""}. Uang yang sudah masuk tetap tercatat sebagai kredit customer.
        </Alert>
      ) : null}

      <div className="metrics" style={{ marginTop: 16 }}>
        {[
          ["Nilai berjalan", value, order.amendments.length ? `Awal ${formatRupiah(order.originalValue)} · ${order.amendments.length} amandemen` : "Belum ada amandemen"],
          ["Ditagih", billed, `${share(billed, value)}% dari nilai`],
          ["Terbayar", settled, billed > 0n ? `${share(settled, billed)}% dari yang ditagih` : "Belum ada invoice"],
          ["Siap ditagih", ready, `${live.filter((item) => item.status === "READY").length} termin menunggu invoice`],
        ].map(([label, amount, note]) => (
          <div key={label as string} className="metric-card">
            <h3 style={{ fontSize: 13 }}>{label as string}</h3>
            <div>
              <span className="metric-value">{formatRupiah(amount as bigint)}</span>
              <span className="metric-label">{note as string}</span>
            </div>
          </div>
        ))}
      </div>

      {active ? (
        <section className="region" style={{ marginTop: 16 }} aria-label="Komposisi nilai pesanan">
          <div className="stackbar" role="img" aria-label={segments.map((segment) => `${segment.label} ${formatRupiah(segment.amount)}`).join(", ")}>
            {segments
              .filter((segment) => segment.amount > 0n)
              .map((segment) => (
                <i key={segment.label} style={{ width: `${share(segment.amount, value)}%`, background: segment.color }} />
              ))}
          </div>
          <div className="legend-row">
            {segments.map((segment) => (
              <span key={segment.label}>
                <i style={{ background: segment.color }} />
                {segment.label} <b className="money">{formatRupiah(segment.amount)}</b>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="bleed with-rail" style={{ marginTop: 16 }}>
        <div className="rail-main">
          <section className="region">
            <div className="card-head">
              <div>
                <h2>Rencana termin</h2>
                <p>Jumlah termin selalu sama dengan nilai berjalan.</p>
              </div>
              {active ? <span className={planTotal === value ? "sum-ok" : "sum-bad"}>{formatRupiah(planTotal)}</span> : null}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Termin</th>
                    <th className="num">Jumlah</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.billingItems.map((item) => {
                    const info = BILLING_STATUS[item.status];
                    const trigger = BILLING_TRIGGERS.find((candidate) => candidate.value === item.trigger)?.label ?? item.trigger;
                    const when =
                      item.trigger === "ON_DATE" && item.dueOn
                        ? `${item.isRetention ? "Retensi · " : ""}${formatDate(item.dueOn)}`
                        : item.trigger === "ON_MILESTONE" && item.milestoneDoneAt
                          ? `${item.milestoneRef ?? "Milestone"} selesai ${formatDate(item.milestoneDoneAt, workspace.timezone)}`
                          : trigger;
                    return (
                      <tr key={item.id} style={item.status === "CANCELLED" ? { opacity: 0.55 } : undefined}>
                        <td data-label="Termin" style={{ whiteSpace: "normal" }}>
                          <div>
                            <b>{item.label}</b>
                            <small>{when}</small>
                          </div>
                        </td>
                        <td data-label="Jumlah" className="num">
                          <div>
                            {formatRupiah(item.amount)}
                            <small>{share(BigInt(item.amount), value)}%</small>
                          </div>
                        </td>
                        <td data-label="Status">
                          <div className="row" style={{ gap: 8 }}>
                            {item.invoiceId ? (
                              <Link className="doc-id" href={`/invoices/${item.invoiceId}`}>
                                {item.invoiceNumber}
                              </Link>
                            ) : (
                              <Badge tone={info?.tone}>{info?.label ?? item.status}</Badge>
                            )}
                            {active && item.status === "READY" && canInvoice ? (
                              <ButtonLink variant="secondary" href={`/invoices/new?billingItemId=${item.id}`}>
                                Terbitkan invoice
                              </ButtonLink>
                            ) : active && item.status === "PLANNED" && item.trigger === "ON_MILESTONE" ? (
                              <MilestoneButton orderId={order.id} billingItemId={item.id} label={item.label} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="region">
            <h2>Amandemen</h2>
            {order.amendments.length === 0 ? (
              <p className="quiet-empty">Belum ada amandemen. Kerja tambah atau kurang dicatat di sini, nilai awal tetap tersimpan.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th className="num">Perubahan</th>
                      <th>Alasan</th>
                      <th>Referensi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.amendments.map((amendment) => {
                      const delta = BigInt(amendment.delta);
                      return (
                        <tr key={amendment.id}>
                          <td data-label="Tanggal" className="nowrap">
                            <div>{formatDate(amendment.effectiveDate)}</div>
                          </td>
                          <td data-label="Perubahan" className="num">
                            <div>
                              <b>{`${delta > 0n ? "+" : "−"}${formatRupiah(delta > 0n ? delta : -delta)}`}</b>
                            </div>
                          </td>
                          <td data-label="Alasan">
                            <div>{amendment.reason}</div>
                          </td>
                          <td data-label="Referensi">
                            <div>{amendment.reference ?? "-"}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="rail-divider" />
        <aside className="rail-side">
          <section className="region">
            <h2>Komitmen</h2>
            <dl>
              <KeyValue label="Jenis">{commitmentLabel(order.commitmentType)}</KeyValue>
              <KeyValue label="Nomor">{order.commitmentRef ?? "-"}</KeyValue>
              <KeyValue label="Tanggal">{formatDate(order.commitmentDate)}</KeyValue>
              <KeyValue label="Nilai awal">{formatRupiah(order.originalValue)}</KeyValue>
              <KeyValue label="Sumber">{order.sourceQuotationId ? <Link href={`/quotations/${order.sourceQuotationId}`}>Lihat quotation</Link> : "Diisi manual"}</KeyValue>
              <KeyValue label="Deal">{order.dealId ? <Link href={`/deals/${order.dealId}`}>Buka deal</Link> : "Pesanan langsung"}</KeyValue>
              <KeyValue label="Customer">
                <Link href={`/customers/${order.customerId}`}>{order.customerName}</Link>
              </KeyValue>
            </dl>
          </section>
          {order.scope ? (
            <section className="region">
              <h2>Lingkup</h2>
              <p style={{ whiteSpace: "pre-line" }}>{order.scope}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
