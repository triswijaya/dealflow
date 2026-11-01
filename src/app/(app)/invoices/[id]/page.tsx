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
import { DetailHeader, EmptyState } from "@/components/ui/misc";
import { MetricCard } from "@/components/ui/stat";
import { daysUntil, formatDate, formatDateTime, formatPhone, formatQuantity, formatRupiah, zonedDateString } from "@/lib/format";
import { INVOICE_STATUS, SETTLEMENT_KIND, followUpTypeLabel, paymentMethodLabel } from "@/lib/labels";
import { getInvoiceDetail, listInvoiceActivities } from "@/server/invoices/invoice-views";
import { listCollectionTasks } from "@/server/collections/collections";
import { getCustomerCredit } from "@/server/receipts/receipts";
import { load, requireWorkspace } from "../../workspace";
import { CancelTaskButton, CollectionTaskButton, CollectionWhatsAppButton, CompleteTaskButton } from "../collection-controls";
import { InvoiceMoreActions, ReverseSettlementButton, UseCreditButton } from "../invoice-actions";
import { RecordPaymentButton } from "../invoice-controls";
import { CircleCheck, Clock, Receipt, TriangleAlert, WalletCards } from "lucide-react";

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
  const voided = invoice.voidedAt !== null;
  const liveSettlements = invoice.payments.filter((payment) => !payment.reversedAt);
  const credit = !voided && remaining > 0n ? await load((headers) => getCustomerCredit({ headers, customerId: invoice.customerId })) : null;
  const hasCredit = credit !== null && BigInt(credit.credit) > 0n;
  const tasks = await load((headers) => listCollectionTasks({ headers, invoiceId: invoice.id }));
  const owed = !voided && remaining > 0n;

  return (
    <>
      <SetBreadcrumb trail={[invoice.invoiceNumber]} />
      <DetailHeader
        backHref="/invoices"
        backLabel="Kembali ke daftar invoice"
        title={invoice.invoiceNumber}
        titleClassName="doc-id"
        badge={<Badge tone={info?.tone}>{invoice.status === "OVERDUE" ? "Lewat jatuh tempo" : (info?.label ?? invoice.status)}</Badge>}
        description={
          <>
            {invoice.customer.companyName} · {dealsReady && invoice.dealId ? <Link href={`/deals/${invoice.dealId}`}>{invoice.dealTitle}</Link> : invoice.dealTitle} ·{" "}
            <Link href={`/orders/${invoice.orderId}`} className="doc-id">
              {invoice.orderNumber}
            </Link>{" "}
            · {invoice.billingItemLabel}
            {invoice.sourceQuotation ? (
              <>
                {" · "}
                <Link href={`/quotations/${invoice.sourceQuotation.id}`}>{invoice.sourceQuotation.quotationNumber}</Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <ButtonLink variant="secondary" href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
              PDF
            </ButtonLink>
            <InvoiceMoreActions
              invoice={{
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                total: invoice.total,
                remainingAmount: invoice.remainingAmount,
                hasLiveSettlement: liveSettlements.length > 0,
                voided,
              }}
            />
            {hasCredit ? <UseCreditButton customerId={invoice.customerId} invoiceId={invoice.id} /> : null}
            {!voided && remaining > 0n ? (
              <RecordPaymentButton
                today={workspace.today}
                invoice={{
                  id: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  customerName: invoice.customer.companyName ?? "",
                  issueDate: invoice.issueDate,
                  total: invoice.total,
                  remainingAmount: invoice.remainingAmount,
                }}
              />
            ) : null}
          </>
        }
      />

      {voided ? (
        <Alert tone="warning">
          Invoice ini di-void
          {invoice.voidReason ? `: ${invoice.voidReason}` : ""}. Nomornya tidak dipakai ulang dan tidak dihitung sebagai piutang.{" "}
          {invoice.replacedBy ? (
            <>
              Diganti oleh{" "}
              <Link className="doc-id" href={`/invoices/${invoice.replacedBy.id}`}>
                {invoice.replacedBy.invoiceNumber}
              </Link>
              .
            </>
          ) : (
            <Link href={`/invoices/new?billingItemId=${invoice.billingItemId}&replaces=${invoice.id}`}>Terbitkan invoice pengganti</Link>
          )}
        </Alert>
      ) : null}
      {invoice.replaces ? (
        <Alert tone="info">
          Menggantikan{" "}
          <Link className="doc-id" href={`/invoices/${invoice.replaces.id}`}>
            {invoice.replaces.invoiceNumber}
          </Link>{" "}
          yang sudah di-void.
        </Alert>
      ) : null}
      {hasCredit ? (
        <Alert tone="info">
          Customer ini punya kredit {formatRupiah(credit.credit)} dari {credit.receipts} uang masuk yang belum terpakai. Pakai untuk melunasi invoice ini tanpa mencatat pembayaran baru.
        </Alert>
      ) : null}

      <div className="metrics">
        <MetricCard icon={Receipt} hue="indigo" title="Total" value={formatRupiah(invoice.total)} label="Total invoice" href="#dokumen" hint={formatRupiah(invoice.total)} />
        <MetricCard
          icon={CircleCheck}
          hue="mint"
          title="Terbayar"
          value={formatRupiah(invoice.paidAmount)}
          label="Pembayaran tercatat"
          href="#riwayat-pembayaran"
          hint={formatRupiah(invoice.paidAmount)}
        />
        <MetricCard
          icon={overdueDays > 0 ? TriangleAlert : Clock}
          hue={overdueDays > 0 ? "coral" : "butter"}
          title="Sisa"
          value={formatRupiah(invoice.remainingAmount)}
          label={overdueDays > 0 ? `Lewat ${overdueDays} hari` : `Jatuh tempo ${formatDate(invoice.dueDate)}`}
          href="#riwayat-pembayaran"
          hint={formatRupiah(invoice.remainingAmount)}
          danger={overdueDays > 0}
        />
      </div>
      <section className="region" style={{ marginTop: 16 }}>
        <div className="progress" role="img" aria-label={`${percent}% terbayar`}>
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
            <dd>
              {overdueDays > 0 ? (
                <span className="red">
                  {formatDate(invoice.dueDate)} · lewat {overdueDays} hari
                </span>
              ) : (
                formatDate(invoice.dueDate)
              )}
            </dd>
          </div>
          <div className="kv">
            <dt>Dibuat oleh</dt>
            <dd>{invoice.createdByName ?? "-"}</dd>
          </div>
        </dl>
      </section>

      {overdueDays > 0 ? (
        <Alert tone="error">
          Invoice lewat jatuh tempo {overdueDays} hari. Sisa tagihan {formatRupiah(invoice.remainingAmount)}.{paid > 0n ? ` Sudah dibayar sebagian: ${formatRupiah(invoice.paidAmount)}` : ""}
        </Alert>
      ) : null}

      <div className="stack" style={{ marginTop: 24 }}>
        <section className="region" id="riwayat-pembayaran">
          <h2>Riwayat pelunasan</h2>
          {invoice.payments.length === 0 ? (
            <EmptyState size="region" icon={WalletCards} title="Belum ada pelunasan" description="Pembayaran, potongan PPh, dan penghapusan selisih tampil di sini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Jenis</th>
                    <th className="num">Jumlah</th>
                    <th>Metode</th>
                    <th>Referensi</th>
                    <th>Catatan</th>
                    <th>Dicatat oleh</th>
                    <th>Dicatat pada</th>
                    <th>
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id} className={payment.reversedAt ? "reversed" : undefined}>
                      <td data-label="Tanggal">
                        <div>{formatDate(payment.paymentDate)}</div>
                      </td>
                      <td data-label="Jenis">
                        <div>
                          {payment.receiptId ? <Link href={`/receipts/${payment.receiptId}`}>{SETTLEMENT_KIND[payment.kind] ?? payment.kind}</Link> : (SETTLEMENT_KIND[payment.kind] ?? payment.kind)}
                          {payment.reversedAt ? (
                            <small className="muted">
                              {" "}
                              Dibatalkan
                              {payment.reversalReason ? `: ${payment.reversalReason}` : ""}
                            </small>
                          ) : null}
                        </div>
                      </td>
                      <td className="num" data-label="Jumlah">
                        <div className="money">{formatRupiah(payment.amount)}</div>
                      </td>
                      <td data-label="Metode">
                        <div>{payment.kind === "RECEIPT" ? paymentMethodLabel(payment.paymentMethod) : "-"}</div>
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
                      <td data-label="Aksi">
                        <div>
                          {payment.reversedAt ? null : (
                            <ReverseSettlementButton
                              invoiceId={invoice.id}
                              settlementId={payment.id}
                              label={`${SETTLEMENT_KIND[payment.kind] ?? payment.kind} ${formatRupiah(payment.amount)} pada ${formatDate(payment.paymentDate)}`}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="region" id="penagihan">
          <div className="card-head">
            <h2>Penagihan</h2>
            {owed ? (
              <div className="row" style={{ gap: 8 }}>
                <CollectionWhatsAppButton invoiceId={invoice.id} />
                <CollectionTaskButton invoiceId={invoice.id} timezone={timezone} promise />
                <CollectionTaskButton invoiceId={invoice.id} timezone={timezone} variant="tertiary" />
              </div>
            ) : null}
          </div>
          {tasks.length === 0 ? (
            <p className="quiet-empty">{owed ? "Belum ada langkah penagihan. Catat telepon, WhatsApp, atau janji bayar dari customer." : "Tidak ada yang perlu ditagih."}</p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => {
                const open = !task.completedAt && !task.cancelledAt;
                const promise = task.type === "PROMISE_TO_PAY";
                const broken = promise && open && zonedDateString(new Date(task.followUpAt), timezone) < workspace.today && owed;
                return (
                  <li key={task.id} className={open ? undefined : "done"}>
                    <div>
                      <b>{promise ? "Janji bayar" : followUpTypeLabel(task.type)}</b> <span className="muted">· {promise ? formatDate(task.followUpAt, timezone) : formatDateTime(task.followUpAt, timezone)}</span>
                      {broken ? <Badge tone="danger">Janji terlewat</Badge> : null}
                      {task.completedAt ? <Badge tone="success">Selesai</Badge> : null}
                      {task.cancelledAt ? <Badge tone="neutral">Dibatalkan</Badge> : null}
                      {task.note ? <small>{task.note}</small> : null}
                      {task.cancelReason ? <small>Alasan batal: {task.cancelReason}</small> : null}
                    </div>
                    {open ? (
                      <div className="row" style={{ gap: 4 }}>
                        <CompleteTaskButton invoiceId={invoice.id} followUpId={task.id} version={task.version} />
                        <CancelTaskButton invoiceId={invoice.id} followUpId={task.id} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
