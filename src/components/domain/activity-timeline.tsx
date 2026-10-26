import Link from "next/link";
import type { ReactNode } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { Avatar, QuietEmpty } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatRelative, formatRupiah, formatTime, firstName } from "@/lib/format";
import { DEAL_STAGE, followUpTypeLabel, lostReasonLabel, type DealStage } from "@/lib/labels";
import type { ActivityDto, FeedActivityDto } from "@/server/deals/deal-views";

type Meta = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const stage = (value: unknown) => DEAL_STAGE[text(value) as DealStage]?.label ?? text(value);

function money(value: unknown): string | null {
  return typeof value === "string" && /^\d+$/.test(value) ? formatRupiah(value) : null;
}

function documentLink(kind: "quotation" | "invoice", id: unknown, label: unknown): ReactNode {
  const name = text(label);
  if (!name) return kind === "quotation" ? "quotation" : "invoice";
  const path = kind === "quotation" ? "/quotations" : "/invoices";
  return typeof id === "string" && isBuilt(path) ? <Link href={`${path}/${id}`}>{name}</Link> : <b>{name}</b>;
}

/** AUD-01: one readable sentence per event, built only from the safe metadata the service stored. */
function describe(event: ActivityDto, ctx: { customerName?: string; dealTitle?: string; timezone: string }): ReactNode {
  const meta: Meta = event.metadata ?? {};
  const key = `${event.entityType}.${event.eventType}`;
  switch (key) {
    case "deal.created":
      return <>membuat deal {ctx.dealTitle ? <b>{ctx.dealTitle}</b> : null}</>;
    case "deal.updated": {
      const before = (meta.before ?? {}) as Meta;
      const after = (meta.after ?? {}) as Meta;
      const changes: ReactNode[] = [];
      if (before.estimatedValue !== after.estimatedValue && money(before.estimatedValue) && money(after.estimatedValue)) {
        changes.push(`mengubah nilai deal ${money(before.estimatedValue)} → ${money(after.estimatedValue)}`);
      }
      if (before.assignedToId !== after.assignedToId) changes.push("mengganti assigned sales");
      if (before.customerId !== after.customerId) changes.push("mengganti customer");
      if (before.title !== after.title) changes.push("mengubah judul deal");
      return changes.length > 0 ? changes.map((change, index) => <span key={index}>{index > 0 ? ", " : ""}{change}</span>) : "mengubah detail deal";
    }
    case "deal.stage_changed":
      return meta.reason === "quotation_sent" ? (
        <>memindahkan deal ke {stage(meta.toStatus)} karena quotation ditandai terkirim</>
      ) : (
        <>memindahkan deal dari {stage(meta.fromStatus)} ke {stage(meta.toStatus)}</>
      );
    case "deal.won":
      return <>menandai deal Menang{money(meta.wonValue) ? ` · ${money(meta.wonValue)}` : ""}</>;
    case "deal.lost":
      return (
        <>
          menandai deal Kalah · {lostReasonLabel(text(meta.lostReason) || null)}
          {text(meta.lostNote) ? <small style={{ display: "block", marginTop: 4 }}>{text(meta.lostNote)}</small> : null}
        </>
      );
    case "quotation.created":
      return <>membuat {documentLink("quotation", meta.quotationId, meta.quotationNumber)}</>;
    case "quotation.revised":
      return (
        <>
          membuat revisi {documentLink("quotation", meta.newQuotationId, meta.newQuotationNumber)} dari{" "}
          {documentLink("quotation", meta.sourceQuotationId, meta.sourceQuotationNumber)}
        </>
      );
    case "quotation.sent":
    case "quotation.accepted":
    case "quotation.rejected": {
      const verb = { sent: "terkirim", accepted: "diterima", rejected: "ditolak" }[event.eventType];
      return <>menandai {documentLink("quotation", meta.quotationId, meta.quotationNumber)} {verb}</>;
    }
    case "follow_up.created": {
      const when = typeof meta.followUpAt === "string" ? ` · ${formatDate(meta.followUpAt, ctx.timezone)}, ${formatTime(meta.followUpAt, ctx.timezone)}` : "";
      return <>menjadwalkan follow-up {followUpTypeLabel(text(meta.type))}{when}</>;
    }
    case "follow_up.rescheduled": {
      const from = typeof meta.previousFollowUpAt === "string" ? formatDateTime(meta.previousFollowUpAt, ctx.timezone) : "";
      const to = typeof meta.newFollowUpAt === "string" ? formatDateTime(meta.newFollowUpAt, ctx.timezone) : "";
      return <>menjadwalkan ulang follow-up{from && to ? ` dari ${from} ke ${to}` : ""}</>;
    }
    case "follow_up.completed":
      return "menyelesaikan follow-up";
    case "whatsapp.opened":
      return <>membuka WhatsApp{ctx.customerName ? ` ke ${ctx.customerName}` : ""}</>;
    case "invoice.created":
      return <>menerbitkan {documentLink("invoice", meta.invoiceId, meta.invoiceNumber)}</>;
    case "payment.recorded":
      return <>mencatat pembayaran untuk {documentLink("invoice", meta.invoiceId, meta.invoiceNumber)}</>;
    default:
      return "memperbarui deal";
  }
}

/** The deal's history, newest first. Which events a role receives is decided by the service (AUD-04). */
export function ActivityTimeline({
  events,
  timezone,
  customerName,
  dealTitle,
  showDeal,
}: {
  events: (ActivityDto | FeedActivityDto)[];
  timezone: string;
  customerName?: string;
  dealTitle?: string;
  /** For a feed across deals: name the deal each event belongs to. */
  showDeal?: boolean;
}) {
  if (events.length === 0) {
    return <QuietEmpty>Belum ada aktivitas.</QuietEmpty>;
  }
  const now = new Date();
  return (
    <div className="timeline">
      {events.map((event) => {
        const name = event.actorName ?? "Sistem";
        const feed = "dealId" in event ? event : null;
        return (
          <div key={event.id} className="event">
            <span className="dot" aria-hidden="true" />
            <div className={event.entityType === "whatsapp" ? "muted" : undefined}>
              <Avatar name={name} />
              <strong>{firstName(name)}</strong> {describe(event, { customerName: feed?.customerName ?? customerName, dealTitle: feed?.dealTitle ?? dealTitle, timezone })}
              {showDeal && feed ? (
                <>
                  {" "}
                  <span className="muted">di</span> <Link href={`/deals/${feed.dealId}`}>{feed.dealTitle}</Link>
                </>
              ) : null}
              <small title={formatDateTime(event.createdAt, timezone)}>
                {formatRelative(event.createdAt, now, timezone)} · {formatDateTime(event.createdAt, timezone)}
              </small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
