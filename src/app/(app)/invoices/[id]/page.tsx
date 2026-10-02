import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { isBuilt } from "@/components/app-shell/nav";
import { ActivityTimeline } from "@/components/domain/activity-timeline";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { daysUntil, formatDate, formatDateTime, formatPhone, formatQuantity, formatRupiah } from "@/lib/format";
import { INVOICE_STATUS, paymentMethodLabel } from "@/lib/labels";
import { getInvoiceDetail, listInvoiceActivities } from "@/server/invoices/invoice-views";
import { load, requireWorkspace } from "../../workspace";
import { RecordPaymentButton } from "../invoice-controls";
import { WalletCards } from "lucide-react";

export const metadata: Metadata = { title: "Detail invoice · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Sales have no invoice access (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const timezone = workspace.timezone;

  const invoice = await load((headers) => getInvoiceDetail({ headers, invoiceId: id }));
  const activities = await load((headers) => listInvoiceActivities({ headers, invoiceId: id }));

  const info = INVOICE_STATUS[invoice.status];
  const total = BigInt(invoice.total);
  const paid = BigInt(invoice.paidAmount);
  const remaining = BigInt(invoice.remainingAmount);
  const percent = total === 0n ? 0 : Number((paid * 100n) / total);
  const overdueDays = invoice.status === "OVERDUE" ? -daysUntil(invoice.dueDate, workspace.today) : 0;
  const dealsReady = isBuilt("/deals");

  return (
    <>
      <SetBreadcrumb trail={[invoice.invoiceNumber]} />
      <header className="pagehead">
        <div>
          <div className="eyebrow">Invoice</div>
          <h1 style={{ fontFamily: "ui-monospace, monospace" }}>{invoice.invoiceNumber}</h1>
          <p>
            {invoice.customer.companyName} · {dealsReady ? <Link href={`/deals/${invoice.dealId}`}>{invoice.dealTitle}</Link> : invoice.dealTitle} ·{" "}
            {invoice.sourceQuotation ? (
              <Link href={`/quotations/${invoice.sourceQuotation.id}`}>{invoice.sourceQuotation.quotationNumber}</Link>
            ) : (
              "Item manual"
            )}
          </p>
        </div>
        <div className="row actions">
          {remaining > 0n ? (
            <RecordPaymentButton
              today={workspace.today}
              invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, customerName: invoice.customer.companyName ?? "", issueDate: invoice.issueDate, total: invoice.total, remainingAmount: invoice.remainingAmount }}
            />
          ) : null}
        </div>
      </header>

      <div style={{ marginBottom: 14 }}>
        <Badge tone={info?.tone}>{invoice.status === "OVERDUE" ? "Lewat jatuh tempo" : (info?.label ?? invoice.status)}</Badge>
      </div>

      <div className="kpis" style={{ ["--n" as string]: 3 }}>
        <a className="kpi" href="#dokumen" title={formatRupiah(invoice.total)}>
          <label>Total</label>
          <strong>{formatRupiah(invoice.total)}</strong>
          <small>Total invoice</small>
        </a>
        <a className="kpi" href="#riwayat-pembayaran" title={formatRupiah(invoice.paidAmount)}>
          <label>Terbayar</label>
          <strong>{formatRupiah(invoice.paidAmount)}</strong>
          <small>Pembayaran tercatat</small>
        </a>
        <a className="kpi is-dark" href="#riwayat-pembayaran" title={formatRupiah(invoice.remainingAmount)}>
          <label>Sisa</label>
          <strong>{formatRupiah(invoice.remainingAmount)}</strong>
          <small>{overdueDays > 0 ? `Lewat ${overdueDays} hari` : `Jatuh tempo ${formatDate(invoice.dueDate)}`}</small>
        </a>
      </div>
      <div className="progress" role="img" aria-label={`${percent}% terbayar`} style={{ marginTop: 14 }}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{percent}% terbayar</small>

      <dl>
        <div className="kv">
          <dt>Tanggal terbit</dt>
          <dd>{formatDate(invoice.issueDate)}</dd>
        </div>
        <div className="kv">
          <dt>Jatuh tempo</dt>
          <dd>{overdueDays > 0 ? <span className="red">{formatDate(invoice.dueDate)} · lewat {overdueDays} hari</span> : formatDate(invoice.dueDate)}</dd>
        </div>
        <div className="kv">
          <dt>Dibuat oleh</dt>
          <dd>{invoice.createdByName ?? "-"}</dd>
        </div>
      </dl>

      {overdueDays > 0 ? (
        <Alert tone="error">
          Invoice lewat jatuh tempo {overdueDays} hari. Sisa tagihan {formatRupiah(invoice.remainingAmount)}.
          {paid > 0n ? ` Sudah dibayar sebagian: ${formatRupiah(invoice.paidAmount)}` : ""}
        </Alert>
      ) : null}

      <div className="stack" style={{ marginTop: 24 }}>
        <Card id="riwayat-pembayaran">
          <h2>Riwayat pembayaran</h2>
          {invoice.payments.length === 0 ? (
            <EmptyState icon={WalletCards} title="Belum ada pembayaran." description="Pembayaran akan ditampilkan setelah dicatat." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal bayar</th>
                    <th className="num">Jumlah</th>
                    <th>Metode</th>
                    <th>Referensi</th>
                    <th>Catatan</th>
                    <th>Dicatat oleh</th>
                    <th>Dicatat pada</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td data-label="Tanggal bayar">
                        <div>{formatDate(payment.paymentDate)}</div>
                      </td>
                      <td className="num" data-label="Jumlah">
                        <div>{formatRupiah(payment.amount)}</div>
                      </td>
                      <td data-label="Metode">
                        <div>{paymentMethodLabel(payment.paymentMethod)}</div>
                      </td>
                      <td data-label="Referensi">
                        <div>{payment.reference ?? "-"}</div>
                      </td>
                      <td data-label="Catatan">
                        <div>{payment.note ?? "-"}</div>
                      </td>
                      <td data-label="Dicatat oleh">
                        <div>{payment.createdByName ?? "-"}</div>
                      </td>
                      <td data-label="Dicatat pada">
                        <div>{formatDateTime(payment.createdAt, timezone)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div id="dokumen" className="stack">
          <Alert tone="info">Invoice terbit bersifat final.</Alert>
          <article className="document">
            <div className="dochead">
              <div>
                <strong>{invoice.seller.name ?? "-"}</strong>
                <p>
                  {invoice.seller.address ? (
                    <>
                      {invoice.seller.address}
                      <br />
                    </>
                  ) : null}
                  {invoice.seller.contactPhone ? (
                    <>
                      {invoice.seller.contactPhone}
                      <br />
                    </>
                  ) : null}
                  {invoice.seller.contactEmail}
                </p>
              </div>
              <div>
                <h2>INVOICE</h2>
                <b>{invoice.invoiceNumber}</b>
                <p>
                  Tanggal terbit: {formatDate(invoice.issueDate)}
                  <br />
                  Jatuh tempo: {formatDate(invoice.dueDate)}
                </p>
              </div>
            </div>
            <div style={{ padding: "20px 0" }}>
              <div className="eyebrow">Kepada</div>
              <h3>{invoice.customer.companyName}</h3>
              <p className="muted" style={{ fontSize: 12 }}>
                {invoice.customer.contactPerson}
                {invoice.customer.address ? (
                  <>
                    <br />
                    {invoice.customer.address}
                  </>
                ) : null}
                <br />
                {[invoice.customer.phone ? formatPhone(invoice.customer.phone) : null, invoice.customer.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Deskripsi</th>
                    <th>Qty</th>
                    <th>Satuan</th>
                    <th className="num">Harga satuan</th>
                    <th className="num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={item.id}>
                      <td data-label="No">
                        <div>{index + 1}</div>
                      </td>
                      <td data-label="Deskripsi">
                        <div style={{ whiteSpace: "pre-line" }}>{item.description}</div>
                      </td>
                      <td data-label="Qty">
                        <div>{formatQuantity(item.quantity)}</div>
                      </td>
                      <td data-label="Satuan">
                        <div>{item.unit}</div>
                      </td>
                      <td className="num" data-label="Harga satuan">
                        <div>{formatRupiah(item.unitPrice)}</div>
                      </td>
                      <td className="num" data-label="Subtotal">
                        <div>{formatRupiah(item.subtotal)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sum">
              <div className="sumrow">
                <span>Subtotal</span>
                <strong>{formatRupiah(invoice.subtotal)}</strong>
              </div>
              <div className="sumrow">
                <span>Diskon</span>
                <span>{formatRupiah(invoice.discount)}</span>
              </div>
              <div className="sumrow">
                <span>Pajak</span>
                <span>{formatRupiah(invoice.tax)}</span>
              </div>
              <div className="line" />
              <div className="sumrow sumtotal">
                <span>Total</span>
                <span>{formatRupiah(invoice.total)}</span>
              </div>
            </div>
            {invoice.notes || invoice.terms ? (
              <div className="stack" style={{ fontSize: 12 }}>
                {invoice.notes ? (
                  <div>
                    <h3>Catatan</h3>
                    <p style={{ whiteSpace: "pre-line" }}>{invoice.notes}</p>
                  </div>
                ) : null}
                {invoice.terms ? (
                  <div>
                    <h3>Syarat &amp; ketentuan</h3>
                    <p style={{ whiteSpace: "pre-line" }}>{invoice.terms}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <footer className="docfooter">
              <span>{invoice.invoiceNumber}</span>
              <span>Halaman 1 dari 1</span>
            </footer>
          </article>
        </div>

        <Card>
          <h2>Aktivitas finance</h2>
          <ActivityTimeline events={activities} timezone={timezone} customerName={invoice.customer.companyName ?? undefined} dealTitle={invoice.dealTitle} />
        </Card>
        <div>
          <ButtonLink variant="tertiary" href="/invoices">
            ← Semua invoice
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
