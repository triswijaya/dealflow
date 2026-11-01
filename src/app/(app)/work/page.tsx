import { Banknote, CircleCheck, Pause, PhoneCall, Receipt, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDate, formatRupiah } from "@/lib/format";
import { one } from "@/lib/url";
import { getWorkQueues, type CollectionReason } from "@/server/collections/collections";
import { CollectionTaskButton, CollectionWhatsAppButton } from "../invoices/collection-controls";
import { load, requireWorkspace } from "../workspace";

export const metadata: Metadata = { title: "Antrian kerja · DealFlow" };

const REASON: Record<CollectionReason, { label: string; tone: "danger" | "warning" | "info" }> = {
  PROMISE_BROKEN: { label: "Janji bayar terlewat", tone: "danger" },
  OVERDUE: { label: "Lewat jatuh tempo", tone: "danger" },
  DUE_SOON: { label: "Jatuh tempo minggu ini", tone: "warning" },
};

type Tab = "ready" | "collection" | "unallocated" | "review";

/** TASK-01: what needs doing now, derived from the data; a queue the role may not see is left out. */
export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const workspace = await requireWorkspace();
  const params = await searchParams;
  const queues = await load((headers) => getWorkQueues({ headers }));

  const cards: { key: Tab; label: string; icon: LucideIcon; count: number; amount: string | null; hot: boolean; hint: string; empty: string }[] = [];
  if (queues.readyToBill)
    cards.push({ key: "ready", label: "Siap ditagih", icon: Receipt, count: queues.readyToBill.count, amount: queues.readyToBill.total, hot: false, hint: "Termin yang syaratnya terpenuhi dan belum punya invoice.", empty: "Semua termin yang siap sudah ditagih." });
  if (queues.collection)
    cards.push({ key: "collection", label: "Perlu ditagih", icon: PhoneCall, count: queues.collection.count, amount: null, hot: queues.collection.items.some((item) => item.reason === "PROMISE_BROKEN"), hint: "Janji bayar terlewat, lewat jatuh tempo, atau jatuh tempo minggu ini, tanpa tugas penagihan yang terbuka.", empty: "Tidak ada invoice yang perlu dikejar." });
  if (queues.unallocatedMoney)
    cards.push({ key: "unallocated", label: "Uang belum teralokasi", icon: Banknote, count: queues.unallocatedMoney.count, amount: queues.unallocatedMoney.total, hot: false, hint: "Uang masuk yang masih ada sisa, termasuk yang pengirimnya belum dikenali.", empty: "Semua uang masuk sudah teralokasi." });
  if (queues.reviewDue)
    cards.push({ key: "review", label: "Tinjau deal ditunda", icon: Pause, count: queues.reviewDue.count, amount: null, hot: false, hint: "Deal yang ditunda dan tanggal tinjaunya sudah tiba.", empty: "Tidak ada deal ditunda yang perlu ditinjau." });

  const asked = one(params.tab);
  const current = cards.find((card) => card.key === asked) ?? cards.find((card) => card.count > 0) ?? cards[0];

  return (
    <>
      <PageHeader title="Antrian kerja" description="Yang perlu ditindaklanjuti hari ini, diturunkan langsung dari deal, termin, invoice, dan uang masuk." />
      <nav className="qcards" aria-label="Antrian">
        {cards.map((card) => (
          <Link key={card.key} href={`/work?tab=${card.key}`} className={card.hot ? "qcard hot" : "qcard"} aria-current={card.key === current?.key ? "true" : undefined}>
            <span className="qcard-h">
              <card.icon aria-hidden="true" />
              {card.label}
            </span>
            <span className="qcard-n">{card.count}</span>
            <span className="qcard-a">{card.amount ? formatRupiah(card.amount) : " "}</span>
          </Link>
        ))}
      </nav>

      {current ? (
        <section className="region" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2>
                {current.label} <span className="muted">{current.count}</span>
              </h2>
              <p className="muted" style={{ fontSize: 12 }}>
                {current.hint}
              </p>
            </div>
          </div>
          {current.count === 0 ? (
            <EmptyState size="region" icon={CircleCheck} title="Antrian kosong" description={current.empty} />
          ) : (
            <ul className="queue-list">
              {current.key === "ready" &&
                queues.readyToBill!.items.map((item) => (
                  <li key={item.billingItemId}>
                    <div>
                      <Link href={`/orders/${item.orderId}`}>
                        <b>{item.label}</b>
                      </Link>{" "}
                      <span className="doc-id muted">{item.orderNumber}</span>
                      <small>{item.customerName}</small>
                    </div>
                    <div className="queue-side">
                      <b className="money">{formatRupiah(item.amount)}</b>
                      <ButtonLink href={`/invoices/new?billingItemId=${item.billingItemId}`}>Terbitkan invoice</ButtonLink>
                    </div>
                  </li>
                ))}
              {current.key === "collection" &&
                queues.collection!.items.map((item) => (
                  <li key={item.invoiceId}>
                    <div>
                      <Link className="doc-id" href={`/invoices/${item.invoiceId}`}>
                        <b>{item.invoiceNumber}</b>
                      </Link>{" "}
                      <Badge tone={REASON[item.reason].tone}>{item.reason === "PROMISE_BROKEN" && item.promisedOn ? `Janji ${formatDate(item.promisedOn)} terlewat` : REASON[item.reason].label}</Badge>
                      <small>
                        {item.customerName} · jatuh tempo {formatDate(item.dueDate)}
                      </small>
                    </div>
                    <div className="queue-side">
                      <b className="money">{formatRupiah(item.remaining)}</b>
                      <CollectionWhatsAppButton invoiceId={item.invoiceId} iconOnly />
                      <CollectionTaskButton invoiceId={item.invoiceId} timezone={workspace.timezone} promise />
                      <ButtonLink href={`/invoices/${item.invoiceId}`}>Buka invoice</ButtonLink>
                    </div>
                  </li>
                ))}
              {current.key === "unallocated" &&
                queues.unallocatedMoney!.items.map((item) => (
                  <li key={item.receiptId}>
                    <div>
                      <Link href={`/receipts/${item.receiptId}`}>
                        <b>{item.customerName ?? "Pengirim belum dikenali"}</b>
                      </Link>
                      {item.customerName ? null : <Badge tone="warning">Perlu identifikasi</Badge>}
                      <small>Diterima {formatDate(item.receivedOn)}</small>
                    </div>
                    <div className="queue-side">
                      <b className="money">{formatRupiah(item.available)}</b>
                      <ButtonLink href={`/receipts/${item.receiptId}`}>{item.customerName ? "Alokasikan" : "Identifikasi"}</ButtonLink>
                    </div>
                  </li>
                ))}
              {current.key === "review" &&
                queues.reviewDue!.items.map((item) => (
                  <li key={item.dealId}>
                    <div>
                      <Link href={`/deals/${item.dealId}`}>
                        <b>{item.title}</b>
                      </Link>
                      <small>
                        {item.customerName} · tanggal tinjau {formatDate(item.onHoldUntil)}
                      </small>
                    </div>
                    <div className="queue-side">
                      <ButtonLink href={`/deals/${item.dealId}`}>Tinjau deal</ButtonLink>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
