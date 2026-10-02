"use client";

import { Clock, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { formatRelative, formatRupiah } from "@/lib/format";
import { DEAL_STAGE, NEXT_DEAL_STAGE, type ActiveDealStage, type Role } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DealFilters, PipelineCardDto, PipelineStageDto } from "@/server/deals/deal-views";
import { loadMorePipelineAction } from "../deals/actions";
import { DealTransitionDialog, type TransitionMode } from "../deals/transition-dialog";
import { FollowUpFormDialog, WhatsAppDialog } from "../follow-ups/follow-up-dialogs";

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

type Dialog = { mode: TransitionMode; card: PipelineCardDto };

/**
 * P-01: five stage columns on desktop, one at a time behind tabs on phones.
 * The server sends the first cards of each stage plus the stage's true count
 * and value; "Muat lebih banyak" asks for the next page of one column.
 */
export function PipelineBoard({
  stages,
  filters,
  role,
  pageSize,
  timezone,
}: {
  stages: PipelineStageDto[];
  filters: Omit<DealFilters, "status" | "createdFrom" | "createdTo">;
  role: Role;
  pageSize: number;
  timezone: string;
}) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<Partial<Record<ActiveDealStage, PipelineCardDto[]>>>({});
  // A move or edit sends fresh stages down; cards appended by "Muat lebih
  // banyak" belong to the old snapshot, so they are dropped with it.
  const signature = stages.map((stage) => `${stage.count}:${stage.items.map((card) => `${card.id}.${card.version}`).join(",")}`).join("|");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setLoaded({});
  }
  const [loading, setLoading] = useState<ActiveDealStage | null>(null);
  const [mobileStage, setMobileStage] = useState<ActiveDealStage>("NEW");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Follow-up and WhatsApp work on the card's deal; one of each is shared by every card.
  const [contact, setContact] = useState<{ kind: "schedule" | "whatsapp"; card: PipelineCardDto } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const openContact = (kind: "schedule" | "whatsapp", card: PipelineCardDto) => {
    setContact({ kind, card });
    setContactOpen(true);
  };
  const openDialog = (next: Dialog) => {
    setDialog(next);
    setDialogOpen(true);
  };

  const cardsOf = (stage: PipelineStageDto) => [...stage.items, ...(loaded[stage.status] ?? [])];

  async function loadMore(stage: PipelineStageDto) {
    setLoading(stage.status);
    const result = await loadMorePipelineAction({ status: stage.status, offset: cardsOf(stage).length, filters });
    setLoading(null);
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    setLoaded((current) => ({ ...current, [stage.status]: [...(current[stage.status] ?? []), ...result.data] }));
  }

  return (
    <>
      <div className="mobile-stage-tabs" role="tablist" aria-label="Tahap deal">
        {stages.map((stage) => (
          <button
            key={stage.status}
            type="button"
            role="tab"
            aria-selected={mobileStage === stage.status}
            className={cn(mobileStage === stage.status && "active")}
            onClick={() => setMobileStage(stage.status)}
          >
            {DEAL_STAGE[stage.status].label} ({stage.count})
          </button>
        ))}
      </div>

      <div className="board">
        {stages.map((stage) => {
          const cards = cardsOf(stage);
          const remaining = stage.count - cards.length;
          return (
            <section key={stage.status} className={cn("column", mobileStage === stage.status && "is-mobile-active")} aria-label={DEAL_STAGE[stage.status].label}>
              <div className="column-head">
                <div className="row between">
                  <strong>{DEAL_STAGE[stage.status].label}</strong>
                  <Badge>{stage.count}</Badge>
                </div>
                <small>
                  {stage.count} deal · {formatRupiah(stage.totalValue)}
                </small>
              </div>
              {cards.length === 0 ? (
                <div className="ghost-empty">Belum ada deal di tahap ini</div>
              ) : (
                cards.map((card) => {
                  const next = NEXT_DEAL_STAGE[stage.status];
                  return (
                    <article key={card.id} className="deal-card">
                      <div className="row between">
                        <small className="muted">{card.customerName}</small>
                        <Menu label="Menu tindakan">
                          <MenuItem onSelect={() => openDialog({ mode: next.to === "WON" ? "won" : "advance", card })}>
                            {next.to === "WON" ? "Tandai menang" : `Pindah ke ${DEAL_STAGE[next.to].label}`}
                          </MenuItem>
                          <MenuItem onSelect={() => openContact("schedule", card)}>Jadwalkan follow-up</MenuItem>
                          <MenuItem onSelect={() => openContact("whatsapp", card)}>Buka WhatsApp</MenuItem>
                          <MenuItem danger onSelect={() => openDialog({ mode: "lost", card })}>
                            Tandai kalah
                          </MenuItem>
                        </Menu>
                      </div>
                      <h3>
                        <Link href={`/deals/${card.id}`}>{card.title}</Link>
                      </h3>
                      <div className="row between">
                        <b className="money">{formatRupiah(card.estimatedValue)}</b>
                        {card.hasQuotation ? <FileText aria-label="Sudah memiliki quotation" role="img" /> : null}
                      </div>
                      <div className="row" style={{ marginTop: 18, flexWrap: "nowrap" }}>
                        <Avatar name={card.assignedToName} />
                        <small>Aktivitas {lowerFirst(formatRelative(card.lastActivityAt))}</small>
                      </div>
                      {card.followUpOverdue ? (
                        <small className="red" style={{ display: "block", marginTop: 8 }}>
                          <Clock aria-hidden="true" style={{ width: 14, height: 14, marginRight: 5, verticalAlign: -2 }} />
                          Follow-up terlambat
                        </small>
                      ) : null}
                    </article>
                  );
                })
              )}
              {remaining > 0 ? (
                <Button variant="tertiary" pending={loading === stage.status} pendingText="Memuat..." onClick={() => loadMore(stage)}>
                  Muat lebih banyak ({Math.min(remaining, pageSize)})
                </Button>
              ) : null}
            </section>
          );
        })}
      </div>

      {contact?.kind === "schedule" ? (
        <FollowUpFormDialog
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          timezone={timezone}
          deal={{ id: contact.card.id, title: contact.card.title, customerName: contact.card.customerName }}
        />
      ) : null}
      {contact?.kind === "whatsapp" ? <WhatsAppDialog open={contactOpen} onClose={() => setContactOpen(false)} dealId={contact.card.id} timezone={timezone} /> : null}
      {dialog ? (
        <DealTransitionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          mode={dialog.mode}
          role={role}
          deal={{
            id: dialog.card.id,
            title: dialog.card.title,
            customerName: dialog.card.customerName,
            status: dialog.card.status,
            version: dialog.card.version,
            estimatedValue: dialog.card.estimatedValue,
          }}
        />
      ) : null}
    </>
  );
}
