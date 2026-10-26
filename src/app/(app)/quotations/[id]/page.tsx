import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { isBuilt } from "@/components/app-shell/nav";
import { ActivityTimeline } from "@/components/domain/activity-timeline";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DetailHeader } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatPhone, formatQuantity, formatRupiah, daysUntil } from "@/lib/format";
import { QUOTATION_STATUS } from "@/lib/labels";
import { getQuotationDetail, listQuotationActivities } from "@/server/quotations/quotation-views";
import { load, requireWorkspace } from "../../workspace";
import { QuotationActions } from "../quotation-actions";

export const metadata: Metadata = { title: "Detail quotation · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANNOT_SEND_DEAL = ["NEW", "CONTACTED", "LOST"];

export default async function QuotationDetailPage({ params }: PageProps<"/quotations/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Finance has no quotation access in this milestone (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const timezone = workspace.timezone;

  const quotation = await load((headers) => getQuotationDetail({ headers, quotationId: id }));
  const activities = await load((headers) => listQuotationActivities({ headers, quotationId: id }));

  const info = QUOTATION_STATUS[quotation.status];
  const draft = quotation.status === "DRAFT";
  const lateDraft = draft && quotation.validUntil < workspace.today;
  const dealBlocks = draft && quotation.isLatest && CANNOT_SEND_DEAL.includes(quotation.dealStatus);
  const daysLeft = daysUntil(quotation.validUntil, workspace.today);
  const urgent = quotation.status === "SENT" && daysLeft >= 0 && daysLeft <= 3;

  const history: string[] = [];
  if (draft) history.push("Draf belum dikirim");
  if (quotation.sentAt) history.push(`Terkirim pada ${formatDateTime(quotation.sentAt, timezone)}${quotation.sentByName ? ` · ${quotation.sentByName}` : ""}`);
  if (quotation.acceptedAt) history.push(`Diterima pada ${formatDateTime(quotation.acceptedAt, timezone)}${quotation.acceptedByName ? ` · ${quotation.acceptedByName}` : ""}`);
  if (quotation.rejectedAt) history.push(`Ditolak pada ${formatDateTime(quotation.rejectedAt, timezone)}${quotation.rejectedByName ? ` · ${quotation.rejectedByName}` : ""}`);

  const invoiceReady = isBuilt("/invoices");

  return (
    <>
      <SetBreadcrumb trail={[quotation.quotationNumber]} />
      <DetailHeader
        backHref="/quotations"
        backLabel="Kembali ke daftar quotation"
        title={quotation.quotationNumber}
        titleClassName="doc-id"
        badge={
          <>
            <Badge tone={info?.tone}>{info?.label ?? quotation.status}</Badge>
            {quotation.isLatest ? <Badge>Versi terbaru</Badge> : <Badge tone="outline">Versi lama</Badge>}
          </>
        }
        description={
          <>
            {quotation.dealTitle} · {quotation.customerName}
          </>
        }
        actions={
          <QuotationActions
            quotation={{
              id: quotation.id,
              quotationNumber: quotation.quotationNumber,
              status: quotation.status,
              isLatest: quotation.isLatest,
              editVersion: quotation.editVersion,
              latestVersionId: quotation.latestVersionId,
              validUntil: quotation.validUntil,
              today: workspace.today,
              dealId: quotation.dealId,
              dealStatus: quotation.dealStatus,
              timezone,
            }}
          />
        }
      />

      <div className="stack" style={{ gap: 8, marginBottom: 20 }}>
        {quotation.status === "ACCEPTED" ? (
          <Alert tone="success">
            Quotation diterima customer. Status deal tidak berubah otomatis; pindahkan deal secara manual bila sudah sepakat.{" "}
            <Link className="btn tertiary" href={`/deals/${quotation.dealId}`}>
              Buka deal
            </Link>
          </Alert>
        ) : null}
        {quotation.status === "EXPIRED" ? <Alert tone="warning">Sudah kedaluwarsa, tidak bisa diterima.</Alert> : null}
        {!quotation.isLatest ? (
          <Alert tone="info">
            Ini versi lama dan hanya bisa dibaca.{" "}
            <Link className="btn tertiary" href={`/quotations/${quotation.latestVersionId}`}>
              Lihat versi terbaru →
            </Link>
          </Alert>
        ) : null}
        {lateDraft && quotation.isLatest ? (
          <Alert tone="warning">
            Tanggal berlaku sudah lewat. Perbarui tanggal sebelum mengirim.{" "}
            <Link className="btn secondary" href={`/quotations/${quotation.id}/edit`}>
              Edit
            </Link>
          </Alert>
        ) : null}
        {dealBlocks && !lateDraft ? (
          <Alert tone="info">
            Deal harus Terkualifikasi sebelum quotation dapat ditandai terkirim.{" "}
            <Link className="btn tertiary" href={`/deals/${quotation.dealId}`}>
              Buka deal
            </Link>
          </Alert>
        ) : null}
        {quotation.invoice ? (
          <Alert tone="info">
            Dipakai untuk invoice {invoiceReady ? <Link href={`/invoices/${quotation.invoice.id}`}>{quotation.invoice.invoiceNumber}</Link> : <b>{quotation.invoice.invoiceNumber}</b>}. Quotation sumber dikunci. Invoice yang sudah terbit tidak ikut berubah.
          </Alert>
        ) : null}
      </div>

      <dl>
        <div className="kv">
          <dt>Tanggal terbit</dt>
          <dd>{formatDate(quotation.issueDate)}</dd>
        </div>
        <div className="kv">
          <dt>Berlaku sampai</dt>
          <dd>
            {urgent ? (
              <span style={{ color: "var(--status-warning-ink)" }}>
                {formatDate(quotation.validUntil)} · {daysLeft === 0 ? "hari ini" : `${daysLeft} hari lagi`}
              </span>
            ) : (
              formatDate(quotation.validUntil)
            )}
          </dd>
        </div>
        <div className="kv">
          <dt>Dibuat oleh</dt>
          <dd>{quotation.createdByName ?? "-"}</dd>
        </div>
        <div className="kv">
          <dt>Riwayat status</dt>
          <dd>
            {history.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </dd>
        </div>
      </dl>

      <div className="bleed with-rail" style={{ marginTop: 24 }}>
        <div className="rail-main">
        <article className="document">
          {draft ? (
            <div className="watermark" aria-hidden="true">
              DRAF
            </div>
          ) : null}
          <div className="dochead">
            <div>
              <strong>{quotation.seller.name ?? "-"}</strong>
              <p>
                {quotation.seller.address ? (
                  <>
                    {quotation.seller.address}
                    <br />
                  </>
                ) : null}
                {quotation.seller.contactPhone ? (
                  <>
                    {quotation.seller.contactPhone}
                    <br />
                  </>
                ) : null}
                {quotation.seller.contactEmail}
              </p>
            </div>
            <div>
              <h2>QUOTATION</h2>
              <b>{quotation.quotationNumber}</b>
              <p>
                Tanggal terbit: {formatDate(quotation.issueDate)}
                <br />
                Berlaku sampai: {formatDate(quotation.validUntil)}
              </p>
            </div>
          </div>
          <div style={{ padding: "20px 0" }}>
            <div className="eyebrow">Kepada</div>
            <h3>{quotation.customer.companyName}</h3>
            <p className="muted" style={{ fontSize: 12 }}>
              {quotation.customer.contactPerson}
              {quotation.customer.address ? (
                <>
                  <br />
                  {quotation.customer.address}
                </>
              ) : null}
              <br />
              {[quotation.customer.phone ? formatPhone(quotation.customer.phone) : null, quotation.customer.email].filter(Boolean).join(" · ")}
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
                {quotation.items.map((item, index) => (
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
              <strong>{formatRupiah(quotation.subtotal)}</strong>
            </div>
            <div className="sumrow">
              <span>Diskon</span>
              <span>{formatRupiah(quotation.discount)}</span>
            </div>
            <div className="sumrow">
              <span>Pajak</span>
              <span>{formatRupiah(quotation.tax)}</span>
            </div>
            <div className="line" />
            <div className="sumrow sumtotal">
              <span>Total</span>
              <span>{formatRupiah(quotation.total)}</span>
            </div>
          </div>
          {quotation.notes || quotation.terms ? (
            <div className="stack" style={{ fontSize: 12 }}>
              {quotation.notes ? (
                <div>
                  <h3>Catatan</h3>
                  <p style={{ whiteSpace: "pre-line" }}>{quotation.notes}</p>
                </div>
              ) : null}
              {quotation.terms ? (
                <div>
                  <h3>Syarat &amp; ketentuan</h3>
                  <p style={{ whiteSpace: "pre-line" }}>{quotation.terms}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <footer className="docfooter">
            <span>{quotation.quotationNumber}</span>
            <span>Halaman 1 dari 1</span>
          </footer>
        </article>
        </div>
        <div className="rail-divider" />
        <aside className="rail-side">
          <section className="region">
            <h2>Riwayat versi</h2>
            {[...quotation.versions].reverse().map((version, index) => {
              const versionInfo = QUOTATION_STATUS[version.status];
              return (
                <div key={version.id}>
                  {index > 0 ? <div className="line" /> : null}
                  <p>
                    {version.id === quotation.id ? <b>{version.quotationNumber}</b> : <Link href={`/quotations/${version.id}`}>{version.quotationNumber}</Link>} ·{" "}
                    {version.isLatest ? <Badge tone={versionInfo?.tone}>{versionInfo?.label ?? version.status}</Badge> : <Badge tone="outline">Versi lama</Badge>}
                  </p>
                  {version.isLatest ? <small>Terbaru · {formatDate(version.issueDate)}</small> : null}
                </div>
              );
            })}
            <div style={{ marginTop: 12 }}>
              <ButtonLink variant="tertiary" href={`/quotations/${quotation.id}/versions`}>
                Lihat riwayat versi
              </ButtonLink>
            </div>
          </section>
          <section className="region">
            <h2>Aktivitas quotation</h2>
            <ActivityTimeline events={activities} timezone={timezone} customerName={quotation.customerName} dealTitle={quotation.dealTitle} />
          </section>
        </aside>
      </div>
    </>
  );
}
