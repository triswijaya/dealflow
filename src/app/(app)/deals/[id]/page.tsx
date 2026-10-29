import { CalendarPlus, FileText, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { isBuilt } from "@/components/app-shell/nav";
import { ActivityTimeline } from "@/components/domain/activity-timeline";
import { DealStepper } from "@/components/domain/deal-stepper";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Avatar, DetailHeader, EmptyState, KeyValue, TabLinks } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatPhone, formatRupiah } from "@/lib/format";
import { DEAL_STAGE, INVOICE_STATUS, QUOTATION_STATUS, lostReasonLabel, type DealStage } from "@/lib/labels";
import { one } from "@/lib/url";
import { getDealDetail, listAssignableMembers, listDealActivities } from "@/server/deals/deal-views";
import { listFollowUpRows, type FollowUpRowDto } from "@/server/follow-ups/follow-up-views";
import { listInvoices } from "@/server/invoices/invoices";
import { listQuotations } from "@/server/quotations/quotations";
import { FollowUpItem } from "../../follow-ups/follow-up-item";
import { NextFollowUpCard } from "../../follow-ups/next-follow-up-card";
import { ScheduleFollowUpButton } from "../../follow-ups/follow-up-dialogs";
import { load, requireWorkspace } from "../../workspace";
import { DealActions } from "../deal-actions";

export const metadata: Metadata = { title: "Detail deal · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTES_PREVIEW = 160;
type Tab = "ringkasan" | "quotation" | "follow-up" | "invoice" | "aktivitas";

function Notes({ value }: { value: string | null }) {
  if (!value) return <>-</>;
  if (value.length <= NOTES_PREVIEW) return <span style={{ whiteSpace: "pre-line" }}>{value}</span>;
  const cut = value.lastIndexOf(" ", NOTES_PREVIEW);
  const at = cut > NOTES_PREVIEW / 2 ? cut : NOTES_PREVIEW;
  return (
    <>
      <span style={{ whiteSpace: "pre-line" }}>{value.slice(0, at)}…</span>
      <details className="readmore">
        <summary>Tampilkan lebih banyak</summary>
        <p style={{ whiteSpace: "pre-line" }}>{value.slice(at).trimStart()}</p>
      </details>
    </>
  );
}

export default async function DealDetailPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  // A malformed id is the same 404 as a missing one (TENANT-04).
  if (!UUID.test(id)) notFound();

  const workspace = await requireWorkspace();
  const query = await searchParams;
  const role = workspace.role;
  const finance = role === "FINANCE";
  const timezone = workspace.timezone;

  const deal = await load((headers) => getDealDetail({ headers, dealId: id }));
  const won = deal.status === "WON";
  const lost = deal.status === "LOST";
  const active = !won && !lost;
  const canInvoice = role === "OWNER" || role === "ADMIN" || finance;

  const [members, quotations, followUps, invoices, activities] = await Promise.all([
    finance ? Promise.resolve([]) : load((headers) => listAssignableMembers({ headers })),
    finance ? Promise.resolve([]) : load((headers) => listQuotations({ headers, dealId: id, pageSize: 100 }).then((result) => result.items)),
    finance ? Promise.resolve([]) : load((headers) => listFollowUpRows({ headers, filters: { dealId: id }, pageSize: 100 }).then((result) => result.items)),
    won && canInvoice ? load((headers) => listInvoices({ headers, dealId: id, pageSize: 1 }).then((result) => result.items)) : Promise.resolve([]),
    load((headers) => listDealActivities({ headers, dealId: id })),
  ]);
  const invoice = invoices[0] ?? null;

  const requested = one(query.tab);
  const tabCandidates: Tab[] = finance ? [] : won && canInvoice ? ["ringkasan", "quotation", "follow-up", "invoice", "aktivitas"] : ["ringkasan", "quotation", "follow-up", "aktivitas"];
  const tab: Tab = tabCandidates.find((candidate) => candidate === requested) ?? "ringkasan";

  const stage = DEAL_STAGE[deal.status as DealStage];
  const actor = { userId: workspace.user.id, name: workspace.user.name, role };
  const dealOption = { id: deal.id, title: deal.title, customerName: deal.customer.companyName };
  const autoOpen = one(query.edit) === "1" ? "edit" : one(query.schedule) === "1" ? "schedule" : undefined;

  // Quotations: one card per revision family, showing its latest version.
  const families = quotations.filter((quotation) => quotation.isLatest);
  const versionsOf = (familyId: string) => quotations.filter((quotation) => quotation.familyId === familyId).length;
  const latestQuotation = [...families].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;

  // Follow-ups, grouped the way the reminder list groups them (FUP-03/FUP-04).
  const group = (predicate: (row: FollowUpRowDto) => boolean) => followUps.filter(predicate);
  const overdue = group((row) => row.bucket === "OVERDUE");
  const today = group((row) => row.bucket === "TODAY");
  const upcoming = group((row) => row.bucket === "UPCOMING");
  const finished = group((row) => row.completedAt !== null);
  const legacy = group((row) => row.completedAt === null && row.bucket === null);
  const open = [...overdue, ...today, ...upcoming];
  const nextFollowUp = open[0] ?? null;

  const dealMeta = (
    <div className="dealmeta bleed">
      <dl>
        <div className="kv">
          <dt>Customer</dt>
          <dd>
            <Link href={`/customers/${deal.customer.id}`}>{deal.customer.companyName}</Link>
          </dd>
        </div>
        <div className="kv">
          <dt>{won ? "Nilai menang" : "Nilai estimasi"}</dt>
          <dd>
            <strong style={{ fontSize: 25 }}>{formatRupiah(won && deal.wonValue ? deal.wonValue : deal.estimatedValue)}</strong>
          </dd>
        </div>
        <div className="kv">
          <dt>Assigned sales</dt>
          <dd>
            <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <Avatar name={deal.assignedToName} />
              {deal.assignedToName}
            </span>
          </dd>
        </div>
        <div className="kv">
          <dt>Target closing</dt>
          <dd>{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "-"}</dd>
        </div>
        <div className="kv">
          <dt>Dibuat oleh</dt>
          <dd>
            {deal.createdByName ?? "-"} · {formatDate(deal.createdAt, timezone)}
          </dd>
        </div>
      </dl>
    </div>
  );

  const customerCard = (
    <section className="region">
      <h2>Customer</h2>
      <dl>
        <KeyValue label="Kontak">{deal.customer.contactPerson}</KeyValue>
        <KeyValue label="Telepon">
          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            {formatPhone(deal.customer.phoneNormalized)}
            <CopyButton value={formatPhone(deal.customer.phoneNormalized)} label="Salin nomor" done="Nomor disalin" />
          </span>
        </KeyValue>
        <KeyValue label="Email">{deal.customer.email ? <a href={`mailto:${deal.customer.email}`}>{deal.customer.email}</a> : "-"}</KeyValue>
        <KeyValue label="Alamat">{deal.customer.address ? <span style={{ whiteSpace: "pre-line" }}>{deal.customer.address}</span> : "-"}</KeyValue>
        <KeyValue label="Catatan">
          <Notes value={deal.customer.notes} />
        </KeyValue>
      </dl>
    </section>
  );

  const quotationCard = (quotation: (typeof families)[number]) => {
    const info = QUOTATION_STATUS[quotation.status];
    const versions = versionsOf(quotation.familyId);
    const detailReady = isBuilt("/quotations");
    return (
      <Card key={quotation.id}>
        <div className="row between">
          <h3>{quotation.quotationNumber}</h3>
          <Badge tone={info?.tone}>{info?.label ?? quotation.status}</Badge>
        </div>
        <dl>
          <KeyValue label="Total">{formatRupiah(quotation.total)}</KeyValue>
          <KeyValue label="Berlaku sampai">{formatDate(quotation.validUntil)}</KeyValue>
          <KeyValue label="Riwayat">{detailReady ? <Link href={`/quotations/${quotation.id}/versions`}>{versions} versi →</Link> : `${versions} versi`}</KeyValue>
        </dl>
        {detailReady ? (
          <ButtonLink variant="tertiary" href={`/quotations/${quotation.id}`}>
            Buka
          </ButtonLink>
        ) : null}
      </Card>
    );
  };

  const followGroup = (title: string, rows: FollowUpRowDto[]) =>
    rows.length === 0 ? null : (
      <section key={title} className="region">
        <h2>{title}</h2>
        {rows.map((row) => (
          <FollowUpItem key={row.id} row={row} timezone={timezone} today={workspace.today} canAct />
        ))}
      </section>
    );

  const finalNotice = (
    <div className="stack" style={{ gap: 8 }}>
      {won ? (
        <Alert tone="success">
          Menang pada {deal.wonAt ? formatDate(deal.wonAt, timezone) : "-"} · Nilai menang {formatRupiah(deal.wonValue ?? deal.estimatedValue)}
          <br />
          Deal ini sudah final dan tidak dapat diubah.
        </Alert>
      ) : null}
      {lost ? (
        <Alert tone="error">
          Kalah pada {deal.lostAt ? formatDate(deal.lostAt, timezone) : "-"} · Alasan: {lostReasonLabel(deal.lostReason)}
          {deal.lostNote ? (
            <>
              <br />
              {deal.lostNote}
            </>
          ) : null}
          <br />
          Deal ini sudah final dan tidak dapat diubah.
        </Alert>
      ) : null}
      {won && role === "SALES" ? <Alert tone="info">Deal sudah menang. Finance atau Admin dapat membuat invoice.</Alert> : null}
      {active && !finance && deal.status === "NEGOTIATION" && BigInt(deal.estimatedValue) <= 0n ? (
        <Alert tone="warning">Isi nilai deal lebih dari Rp0 sebelum menandai menang.</Alert>
      ) : null}
    </div>
  );

  return (
    <>
      <SetBreadcrumb trail={[deal.title]} />
      <DetailHeader
        backHref="/deals"
        backLabel="Kembali ke daftar deal"
        title={deal.title}
        badge={<Badge tone={stage?.tone}>{stage?.label ?? deal.status}</Badge>}
        description={
          <>
            {deal.customer.companyName} · {formatRupiah(won && deal.wonValue ? deal.wonValue : deal.estimatedValue)}
          </>
        }
        actions={
          <DealActions
            deal={deal}
            members={members}
            actor={actor}
            timezone={timezone}
            invoice={invoice ? { id: invoice.id, invoiceNumber: invoice.invoiceNumber } : null}
            autoOpen={autoOpen}
          />
        }
      />

      {finalNotice}

      {finance ? null : dealMeta}
      {finance ? null : <DealStepper status={deal.status} enteredAt={deal.stageEnteredAt} timezone={timezone} />}

      {finance ? (
        <div className="stack" style={{ marginTop: 20 }}>
          <Card>
            <h2>Ringkasan</h2>
            <p>
              {deal.title} {won ? `telah disepakati pada ${deal.wonAt ? formatDate(deal.wonAt, timezone) : "-"}. Nilai menang ${formatRupiah(deal.wonValue ?? deal.estimatedValue)}.` : ""}
            </p>
            <dl>
              <KeyValue label="Customer">{deal.customer.companyName}</KeyValue>
              <KeyValue label="Assigned sales">{deal.assignedToName}</KeyValue>
            </dl>
          </Card>
          {invoice ? (
            <Card>
              <h2>Invoice</h2>
              <InvoiceFacts invoice={invoice} />
            </Card>
          ) : null}
          <Card>
            <h2>Quotation</h2>
            <EmptyState size="region" icon={FileText} title="Tidak ada quotation" description="Invoice memakai item manual." />
          </Card>
          <Card>
            <h2>Aktivitas finance</h2>
            <ActivityTimeline events={activities} timezone={timezone} customerName={deal.customer.companyName} dealTitle={deal.title} />
          </Card>
        </div>
      ) : (
        <div className="bleed with-rail" style={{ marginTop: 24 }}>
          <div className="rail-main">
            <TabLinks
              tabs={tabCandidates.map((candidate) => ({
                href: candidate === "ringkasan" ? `/deals/${deal.id}` : `/deals/${deal.id}?tab=${candidate}`,
                label:
                  candidate === "ringkasan"
                    ? "Ringkasan"
                    : candidate === "quotation"
                      ? `Quotation (${families.length})`
                      : candidate === "follow-up"
                        ? `Follow-up (${open.length})`
                        : candidate === "invoice"
                          ? "Invoice"
                          : "Aktivitas",
                active: candidate === tab,
              }))}
            />

            {tab === "ringkasan" ? (
              <section className="region">
                <h2>Ringkasan</h2>
                {deal.description ? <p style={{ whiteSpace: "pre-line" }}>{deal.description}</p> : <p className="muted">Belum ada deskripsi.</p>}
                <dl>
                  <KeyValue label="Catatan">
                    <Notes value={deal.notes} />
                  </KeyValue>
                  <KeyValue label="Dibuat">{formatDateTime(deal.createdAt, timezone)}</KeyValue>
                  <KeyValue label="Diubah terakhir">{formatDateTime(deal.updatedAt, timezone)}</KeyValue>
                  <KeyValue label="Tahap sejak">{formatDateTime(deal.stageSince, timezone)}</KeyValue>
                </dl>
              </section>
            ) : null}

            {tab === "quotation" ? (
              <div className="stack">
                <div className="row between">
                  <div>
                    <h2>Quotation</h2>
                    <p className="muted">
                      {families.length} keluarga quotation · {quotations.length} versi
                    </p>
                  </div>
                  {active && isBuilt("/quotations") && families.length > 0 ? (
                    <ButtonLink variant="secondary" href={`/quotations/new?dealId=${deal.id}`}>
                      Buat quotation
                    </ButtonLink>
                  ) : null}
                </div>
                {families.length === 0 ? (
                  <EmptyState
                    size="region"
                    icon={FileText}
                    title="Belum ada quotation"
                    description="Quotation tidak wajib untuk memenangkan deal. Buat penawaran bila customer memerlukannya."
                    action={
                      active && isBuilt("/quotations") ? (
                        <ButtonLink variant="secondary" href={`/quotations/new?dealId=${deal.id}`}>
                          Buat quotation
                        </ButtonLink>
                      ) : undefined
                    }
                  />
                ) : (
                  families.map(quotationCard)
                )}
              </div>
            ) : null}

            {tab === "follow-up" ? (
              <div className="stack">
                <div className="row between">
                  <div>
                    <h2>Follow-up</h2>
                    <p className="muted">Percakapan untuk deal ini.</p>
                  </div>
                  {active && followUps.length > 0 ? <ScheduleFollowUpButton variant="secondary" timezone={timezone} deal={dealOption} /> : null}
                </div>
                {!active ? <Alert tone="info">Deal sudah final. Follow-up baru tidak dapat dibuat.</Alert> : null}
                {followUps.length === 0 ? (
                  <EmptyState
                    size="region"
                    icon={CalendarPlus}
                    title="Belum ada follow-up untuk deal ini"
                    description={active ? "Jadwalkan percakapan berikutnya dengan customer." : undefined}
                    action={active ? <ScheduleFollowUpButton variant="secondary" timezone={timezone} deal={dealOption} /> : undefined}
                  />
                ) : null}
                {followGroup("Terlambat", overdue)}
                {followGroup("Hari ini", today)}
                {followGroup("Mendatang", upcoming)}
                {followGroup("Follow-up lama · tetap dapat diselesaikan", legacy)}
                {followGroup("Selesai", finished)}
              </div>
            ) : null}

            {tab === "invoice" && invoice ? (
              <section className="region">
                <h2>Invoice deal Menang</h2>
                <InvoiceFacts invoice={invoice} />
              </section>
            ) : null}
            {tab === "invoice" && !invoice ? (
              <EmptyState
                size="region"
                icon={Receipt}
                title="Belum ada invoice untuk deal ini"
                description="Kesepakatan sudah final dan siap ditagih."
                action={isBuilt("/invoices") ? <ButtonLink variant="secondary" href={`/invoices/new?dealId=${deal.id}`}>Buat invoice</ButtonLink> : undefined}
              />
            ) : null}

            {tab === "aktivitas" ? (
              <section className="region">
                <h2>Riwayat aktivitas</h2>
                <ActivityTimeline events={activities} timezone={timezone} customerName={deal.customer.companyName} dealTitle={deal.title} />
              </section>
            ) : null}
          </div>
          <div className="rail-divider" />
          <aside className="rail-side">
            {customerCard}
            {active ? <NextFollowUpCard next={nextFollowUp} deal={dealOption} timezone={timezone} canSchedule /> : null}
            {latestQuotation ? (
              <section className="region">
                <h2>Quotation terbaru</h2>
                <p>
                  <b>{latestQuotation.quotationNumber}</b>
                </p>
                <Badge tone={QUOTATION_STATUS[latestQuotation.status]?.tone}>{QUOTATION_STATUS[latestQuotation.status]?.label ?? latestQuotation.status}</Badge>
                <p>{formatRupiah(latestQuotation.total)}</p>
                {/* A plain anchor: a Link would prefetch the PDF endpoint. */}
                <a className="btn tertiary" href={`/api/quotations/${latestQuotation.id}/pdf`}>
                  Unduh PDF
                </a>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}

function InvoiceFacts({ invoice }: { invoice: { id: string; invoiceNumber: string; status: string; total: string; remainingAmount: string; dueDate: string } }) {
  const info = INVOICE_STATUS[invoice.status];
  const ready = isBuilt("/invoices");
  return (
    <dl>
      <KeyValue label="Nomor">{ready ? <Link href={`/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link> : invoice.invoiceNumber}</KeyValue>
      <KeyValue label="Status">
        <Badge tone={info?.tone}>{info?.label ?? invoice.status}</Badge>
      </KeyValue>
      <KeyValue label="Total">{formatRupiah(invoice.total)}</KeyValue>
      <KeyValue label="Sisa">{formatRupiah(invoice.remainingAmount)}</KeyValue>
      <KeyValue label="Jatuh tempo">{formatDate(invoice.dueDate)}</KeyValue>
    </dl>
  );
}
