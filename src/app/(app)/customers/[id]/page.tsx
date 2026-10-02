import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { isBuilt } from "@/components/app-shell/nav";
import { Alert } from "@/components/ui/alert";
import { Avatar, EmptyState, KeyValue, TabLinks } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, IconLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPhone, formatRelative, formatRupiah } from "@/lib/format";
import { DEAL_STAGE, isActiveStage, lostReasonLabel, type DealStage } from "@/lib/labels";
import { getCustomer, listCustomerDeals, type CustomerDealDto } from "@/server/customers/customers";
import { load, requireWorkspace } from "../../workspace";
import { CopyButton } from "@/components/ui/copy-button";
import { EditCustomerButton } from "../customer-actions";

export const metadata: Metadata = { title: "Detail customer · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["aktif", "menang", "kalah"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { aktif: "Aktif", menang: "Menang", kalah: "Kalah" };
const NOTES_PREVIEW = 160;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function matches(deal: CustomerDealDto, tab: Tab) {
  if (tab === "menang") return deal.status === "WON";
  if (tab === "kalah") return deal.status === "LOST";
  return isActiveStage(deal.status);
}

function DealCard({ deal, linked }: { deal: CustomerDealDto; linked: boolean }) {
  const stage = DEAL_STAGE[deal.status as DealStage];
  return (
    <div className="card">
      {linked ? <Link href={`/deals/${deal.id}`}>{deal.title}</Link> : <b>{deal.title}</b>}
      <div className="row between" style={{ marginTop: 12 }}>
        <Badge tone={stage?.tone ?? "neutral"}>{stage?.label ?? deal.status}</Badge>
        <b className="money">{formatRupiah(deal.status === "WON" && deal.wonValue ? deal.wonValue : deal.estimatedValue)}</b>
      </div>
      <div className="row" style={{ marginTop: 12, flexWrap: "nowrap" }}>
        <Avatar name={deal.assignedToName} />
        <small>
          {deal.assignedToName} · Aktivitas terakhir: {lowerFirst(formatRelative(deal.lastActivityAt))}
        </small>
      </div>
      {deal.status === "LOST" && deal.lostReason ? (
        <small style={{ display: "block", marginTop: 8 }}>Alasan: {lostReasonLabel(deal.lostReason)}</small>
      ) : null}
    </div>
  );
}

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

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  // A malformed id is the same 404 as a missing one (TENANT-04), and never
  // reaches a uuid column where it would raise a database error instead.
  if (!UUID.test(id)) notFound();

  const workspace = await requireWorkspace();
  const customer = await load((headers) => getCustomer({ headers, customerId: id }));
  const deals = await load((headers) => listCustomerDeals({ headers, customerId: id }));

  const finance = workspace.role === "FINANCE";
  const dealsReady = isBuilt("/deals");
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find((candidate) => candidate === requested) ?? "aktif";
  const visible = finance ? deals : deals.filter((deal) => matches(deal, tab));

  const info = (
    <Card>
      <h2>Informasi customer</h2>
      <dl>
        <KeyValue label="Kontak">{customer.contactPerson}</KeyValue>
        <KeyValue label="Telepon">
          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            {formatPhone(customer.phoneNormalized)}
            <CopyButton value={formatPhone(customer.phoneNormalized)} label="Salin nomor" done="Nomor disalin" />
          </span>
        </KeyValue>
        <KeyValue label="Email">{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "-"}</KeyValue>
        <KeyValue label="Alamat">{customer.address ? <span style={{ whiteSpace: "pre-line" }}>{customer.address}</span> : "-"}</KeyValue>
        <KeyValue label="Catatan">
          <Notes value={customer.notes} />
        </KeyValue>
      </dl>
    </Card>
  );

  const emptyDeals = (message: string) => (
    <EmptyState
      icon={MessageCircle}
      title="Belum ada deal untuk customer ini."
      description={message}
      action={
        !finance && dealsReady ? (
          <ButtonLink variant="secondary" href={`/deals/new?customerId=${customer.id}`}>
            Buat deal
          </ButtonLink>
        ) : undefined
      }
    />
  );

  return (
    <>
      <SetBreadcrumb trail={[customer.companyName]} />
      <header className="pagehead">
        <div>
          <div className="eyebrow">Customer</div>
          <h1 className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
            <Avatar name={customer.companyName} size="lg" />
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{customer.companyName}</span>
          </h1>
          <p>{customer.contactPerson}</p>
        </div>
        <div className="row actions">
          {finance ? null : (
            <EditCustomerButton
              customer={{
                id: customer.id,
                version: customer.version,
                companyName: customer.companyName,
                contactPerson: customer.contactPerson,
                phoneRaw: customer.phoneRaw,
                email: customer.email,
                address: customer.address,
                notes: customer.notes,
              }}
            />
          )}
          <IconLink label="Buka WhatsApp" href={`https://wa.me/${customer.phoneNormalized}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
          </IconLink>
          {!finance && dealsReady ? (
            <ButtonLink href={`/deals/new?customerId=${customer.id}`}>Buat deal</ButtonLink>
          ) : null}
        </div>
      </header>

      <div className={finance ? "cols g2" : "cols split"}>
        {finance ? info : null}
        <Card>
          <h2>{finance ? "Deal Menang" : "Deal customer"}</h2>
          {finance ? null : (
            <TabLinks
              tabs={TABS.map((candidate) => ({
                href: candidate === "aktif" ? `/customers/${customer.id}` : `/customers/${customer.id}?tab=${candidate}`,
                label: TAB_LABEL[candidate],
                active: candidate === tab,
              }))}
            />
          )}
          {visible.length === 0 ? (
            emptyDeals(finance ? "Belum ada deal Menang untuk ditampilkan." : deals.length === 0 ? "Mulai peluang baru untuk customer ini." : `Tab ${TAB_LABEL[tab]} belum memiliki data.`)
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {visible.map((deal) => (
                <DealCard key={deal.id} deal={deal} linked={dealsReady} />
              ))}
            </div>
          )}
        </Card>
        {finance ? null : info}
      </div>

      {finance ? null : (
        <div style={{ marginTop: 20 }}>
          <Alert tone="info">Mengubah data customer tidak mengubah quotation terkirim atau invoice yang sudah terbit.</Alert>
        </div>
      )}
    </>
  );
}
