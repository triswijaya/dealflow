"use client";

import { Check, MessageCircle, Phone, Mail } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, IconButton, IconLink } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { daysUntil, formatDate, formatDateTime, formatRelative, formatRupiah, formatTime, zonedDateString } from "@/lib/format";
import { followUpTypeLabel } from "@/lib/labels";
import type { FollowUpRowDto } from "@/server/follow-ups/follow-up-views";
import { CompleteFollowUpDialog, FollowUpFormDialog, WhatsAppDialog } from "./follow-up-dialogs";

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * One reminder (FUP-05): what it is, which customer and deal it belongs to,
 * the deal value, when, when we last really spoke, and the next moves --
 * mark done, contact, open the deal, reschedule.
 */
export function FollowUpItem({
  row,
  timezone,
  today,
  canAct,
  compact,
}: {
  row: FollowUpRowDto;
  timezone: string;
  today: string;
  canAct: boolean;
  /** The dashboard's short form: customer only, no "Buka deal" and no menu. */
  compact?: boolean;
}) {
  const [dialog, setDialog] = useState<"complete" | "edit" | "whatsapp" | null>(null);
  const [open, setOpen] = useState(false);
  const show = (next: "complete" | "edit" | "whatsapp") => {
    setDialog(next);
    setOpen(true);
  };

  const done = row.completedAt !== null;
  const scheduledDay = zonedDateString(new Date(row.followUpAt), timezone);
  const lateDays = -daysUntil(scheduledDay, today);

  let when: React.ReactNode;
  if (row.bucket === "OVERDUE") {
    when = (
      <span className="red">
        {formatDate(row.followUpAt, timezone)} · {lateDays} hari terlambat
      </span>
    );
  } else if (row.bucket === "TODAY") {
    when = <span className="muted">{formatTime(row.followUpAt, timezone)}</span>;
  } else if (row.bucket === "UPCOMING") {
    when = (
      <span className="muted">
        {formatDate(row.followUpAt, timezone)} · {formatTime(row.followUpAt, timezone)}
      </span>
    );
  } else {
    when = <span className="muted">{formatTime(row.followUpAt, timezone)}</span>;
  }

  const contactNote = done
    ? `Selesai ${formatDateTime(row.completedAt!, timezone)}${row.completedByName ? ` · ${row.completedByName}` : ""}`
    : row.lastContactAt
      ? `Kontak terakhir: ${lowerFirst(formatRelative(row.lastContactAt))}`
      : "Belum ada kontak";

  return (
    <div className="follow">
      {done ? (
        <Badge tone="success">Selesai</Badge>
      ) : canAct ? (
        <IconButton label="Tandai selesai" onClick={() => show("complete")}>
          <Check aria-hidden="true" />
        </IconButton>
      ) : (
        <span />
      )}
      <div>
        <h3>{row.note?.trim() ? row.note : `Follow-up ${followUpTypeLabel(row.type)}`}</h3>
        <p>{compact ? row.customerName : `${row.customerName} · ${row.dealTitle} · ${formatRupiah(row.dealValue)}`}</p>
        <small>{contactNote}</small>
      </div>
      <div className="follow-actions">
        {when}
        {row.type === "CALL" ? (
          <IconLink label="Telepon customer" href={`tel:+${row.customerPhone}`}>
            <Phone aria-hidden="true" />
          </IconLink>
        ) : row.type === "EMAIL" && row.customerEmail ? (
          <IconLink label="Email customer" href={`mailto:${row.customerEmail}`}>
            <Mail aria-hidden="true" />
          </IconLink>
        ) : row.type === "EMAIL" ? null : canAct ? (
          <IconButton label="Buka WhatsApp" onClick={() => show("whatsapp")}>
            <MessageCircle aria-hidden="true" />
          </IconButton>
        ) : null}
        {compact ? null : (
          <ButtonLink variant="tertiary" href={`/deals/${row.dealId}`}>
            Buka deal
          </ButtonLink>
        )}
        {canAct && !compact ? (
          <Menu label="Menu tindakan">
            <MenuItem onSelect={() => show("edit")}>Edit/jadwalkan ulang</MenuItem>
            <MenuItem href={`/customers/${row.customerId}`}>Lihat customer</MenuItem>
          </Menu>
        ) : null}
      </div>

      {dialog === "complete" ? <CompleteFollowUpDialog open={open} onClose={() => setOpen(false)} followUp={row} timezone={timezone} /> : null}
      {dialog === "edit" ? <FollowUpFormDialog open={open} onClose={() => setOpen(false)} timezone={timezone} followUp={row} /> : null}
      {dialog === "whatsapp" ? <WhatsAppDialog open={open} onClose={() => setOpen(false)} dealId={row.dealId} timezone={timezone} /> : null}
    </div>
  );
}
