import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailHeader } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import { getReceipt, getReceiptLines } from "@/server/receipts/receipts";
import { ReverseSettlementButton } from "../../invoices/invoice-actions";
import { load, requireWorkspace } from "../../workspace";
import { ReceiptActions } from "../receipt-controls";

export const metadata: Metadata = { title: "Detail uang masuk · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptDetailPage({ params }: PageProps<"/receipts/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const [receipt, lines] = await Promise.all([load((headers) => getReceipt({ headers, receiptId: id })), load((headers) => getReceiptLines({ headers, receiptId: id }))]);
  const reversed = receipt.status === "REVERSED";
  const title = `${formatRupiah(receipt.amount)} · ${formatDate(receipt.receivedOn)}`;

  return (
    <>
      <SetBreadcrumb trail={[formatDate(receipt.receivedOn)]} />
      <DetailHeader
        backHref="/receipts"
        backLabel="Kembali ke uang masuk"
        title={title}
        badge={reversed ? <Badge tone="neutral">Dibatalkan</Badge> : !receipt.customerId ? <Badge tone="warning">Perlu identifikasi</Badge> : null}
        description={receipt.customerId ? <Link href={`/customers/${receipt.customerId}`}>{receipt.customerName}</Link> : "Pengirim belum dikenali"}
        actions={<ReceiptActions receipt={receipt} today={workspace.today} />}
      />

      {reversed ? <Alert tone="warning">Uang masuk ini dibatalkan{receipt.reversalReason ? `: ${receipt.reversalReason}` : ""}. Tidak dihitung di kas maupun kredit.</Alert> : null}
      {!reversed && !receipt.customerId ? <Alert tone="info">Identifikasi pengirimnya dulu supaya uang ini bisa dialokasikan ke invoice.</Alert> : null}

      <div className="metrics" style={{ marginTop: 16 }}>
        {[
          ["Diterima", receipt.amount],
          ["Teralokasi", receipt.allocatedAmount],
          ["Refund", receipt.refundedAmount],
          ["Sisa (kredit)", receipt.availableAmount],
        ].map(([label, amount]) => (
          <div key={label} className="metric-card">
            <h3 style={{ fontSize: 13 }}>{label}</h3>
            <div>
              <span className="metric-value">{formatRupiah(amount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bleed with-rail" style={{ marginTop: 16 }}>
        <div className="rail-main">
          <section className="region">
            <h2>Alokasi ke invoice</h2>
            {lines.allocations.length === 0 ? (
              <p className="quiet-empty">Belum dialokasikan. Sisa uang tetap menjadi kredit customer.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Tanggal</th>
                      <th className="num">Jumlah</th>
                      <th>
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.allocations.map((line) => (
                      <tr key={line.id} className={line.reversedAt ? "reversed" : undefined}>
                        <td data-label="Invoice">
                          <div>
                            <Link className="doc-id" href={`/invoices/${line.invoiceId}`}>
                              {line.invoiceNumber}
                            </Link>
                            {line.reversedAt ? <small>Dibatalkan{line.reversalReason ? `: ${line.reversalReason}` : ""}</small> : null}
                          </div>
                        </td>
                        <td className="nowrap" data-label="Tanggal">
                          <div>{formatDate(line.settledOn)}</div>
                        </td>
                        <td className="num" data-label="Jumlah">
                          <div className="money">{formatRupiah(line.amount)}</div>
                        </td>
                        <td data-label="Aksi">
                          <div>{line.reversedAt ? null : <ReverseSettlementButton invoiceId={line.invoiceId} settlementId={line.id} label={`${line.invoiceNumber} · ${formatRupiah(line.amount)}`} />}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {lines.refunds.length > 0 ? (
            <section className="region">
              <h2>Refund</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Alasan</th>
                      <th>Referensi</th>
                      <th className="num">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.refunds.map((refund) => (
                      <tr key={refund.id}>
                        <td className="nowrap" data-label="Tanggal">
                          <div>{formatDate(refund.refundedOn)}</div>
                        </td>
                        <td data-label="Alasan">
                          <div>{refund.reason}</div>
                        </td>
                        <td data-label="Referensi">
                          <div>{refund.reference ?? "-"}</div>
                        </td>
                        <td className="num" data-label="Jumlah">
                          <div className="money">{formatRupiah(refund.amount)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
        <div className="rail-divider" />
        <aside className="rail-side">
          <section className="region">
            <h2>Detail</h2>
            <dl>
              <div className="kv">
                <dt>Metode</dt>
                <dd>{paymentMethodLabel(receipt.method)}</dd>
              </div>
              <div className="kv">
                <dt>Referensi</dt>
                <dd>{receipt.reference ?? "-"}</dd>
              </div>
              <div className="kv">
                <dt>Catatan</dt>
                <dd>{receipt.note ?? "-"}</dd>
              </div>
              <div className="kv">
                <dt>Dicatat</dt>
                <dd>{formatDateTime(receipt.createdAt, workspace.timezone)}</dd>
              </div>
              {receipt.identifiedAt ? (
                <div className="kv">
                  <dt>Diidentifikasi</dt>
                  <dd>
                    {formatDateTime(receipt.identifiedAt, workspace.timezone)}
                    {receipt.identificationNote ? <small className="muted"> · {receipt.identificationNote}</small> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
