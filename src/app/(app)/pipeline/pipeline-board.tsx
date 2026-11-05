"use client";

import { Check, Circle, CircleAlert, CircleDashed, FileText, Info, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import { Avatar } from "@/components/ui/misc";
import { Badge, Count } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelative, formatRupiah } from "@/lib/format";
import { ACTIVE_DEAL_STAGES, DEAL_SIGNAL, DEAL_STAGE, type ActiveDealStage, type BadgeTone, type Role } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DealFilters, PipelineCardDto, PipelineStageDto } from "@/server/deals/deal-views";
import { loadMorePipelineAction, transitionDealAction } from "../deals/actions";
import { DealTransitionDialog, type TransitionMode } from "../deals/transition-dialog";
import { FollowUpFormDialog, WhatsAppDialog } from "../follow-ups/follow-up-dialogs";

const STAGE_ICON = { neutral: Circle, outline: Circle, info: Info, brand: CircleDashed, success: Check, warning: CircleAlert, danger: X } as const;

/** The lane's status glyph, in the family colour of its stage. */
function StageGlyph({ tone }: { tone: BadgeTone }) {
  const Glyph = STAGE_ICON[tone];
  const family = tone === "neutral" || tone === "outline" ? "neutral" : tone === "brand" ? "pending" : tone;
  return <Glyph className="stage-glyph" aria-hidden="true" style={{ ["--s-glyph" as string]: `var(--status-${family}-glyph)` }} />;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const DRAG_TYPE = "application/x-dealflow-deal";

type Dialog = { mode: TransitionMode; card: PipelineCardDto };

/**
 * P-01: four stage columns on desktop, one at a time behind tabs on phones.
 * The server sends the first cards of each stage plus the stage's true count
 * and value; "Muat lebih banyak" asks for the next page of one column.
 */
export function PipelineBoard({
  stages,
  filters,
  role,
  pageSize,
  timezone,
  today,
}: {
  stages: PipelineStageDto[];
  filters: Omit<DealFilters, "status" | "createdFrom" | "createdTo">;
  role: Role;
  pageSize: number;
  timezone: string;
  /** The organization's today (YYYY-MM-DD). */
  today: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Partial<Record<ActiveDealStage, PipelineCardDto[]>>>({});
  // A dropped card shows in its new column at once; the server's fresh stages replace this.
  const [moved, setMoved] = useState<{ card: PipelineCardDto; to: ActiveDealStage } | null>(null);
  const [dragging, setDragging] = useState<PipelineCardDto | null>(null);
  const [over, setOver] = useState<ActiveDealStage | null>(null);
  // A move or edit sends fresh stages down; cards appended by "Muat lebih
  // banyak" belong to the old snapshot, so they are dropped with it.
  const signature = stages.map((stage) => `${stage.count}:${stage.items.map((card) => `${card.id}.${card.version}`).join(",")}`).join("|");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setLoaded({});
    setMoved(null);
  }
  const [loading, setLoading] = useState<ActiveDealStage | null>(null);
  const [mobileStage, setMobileStage] = useState<ActiveDealStage>("PROSPECT");
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

  const cardsOf = (stage: PipelineStageDto) => {
    const cards = [...stage.items, ...(loaded[stage.status] ?? [])].filter((card) => card.id !== moved?.card.id);
    return moved?.to === stage.status ? [{ ...moved.card, status: stage.status }, ...cards] : cards;
  };
  // Count and value follow the moved card so the column header agrees with what is shown.
  const shiftOf = (stage: PipelineStageDto) => (moved?.to === stage.status ? 1 : moved?.card.status === stage.status ? -1 : 0);
  const valueOf = (stage: PipelineStageDto) => {
    const delta = BigInt(moved?.card.estimatedValue ?? 0) * BigInt(shiftOf(stage));
    return BigInt(stage.totalValue) + delta;
  };

  // The card id travels in the drag data, which dragover can see (by type) before any re-render.
  function dragOverColumn(event: DragEvent<HTMLElement>, to: ActiveDealStage) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault(); // allows the drop
    event.dataTransfer.dropEffect = "move";
    if (over !== to) setOver(to);
  }
  function dragLeaveColumn(event: DragEvent<HTMLElement>, from: ActiveDealStage) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === from ? null : current));
  }
  function dropOnColumn(event: DragEvent<HTMLElement>, to: ActiveDealStage) {
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const card = stages.flatMap(cardsOf).find((item) => item.id === id);
    if (!card) return;
    event.preventDefault();
    void drop(card, to);
  }

  /** Jira-style move: dropping a card on another column changes its stage right away. */
  async function drop(card: PipelineCardDto, to: ActiveDealStage) {
    setDragging(null);
    setOver(null);
    if (card.status === to) return;
    // A value is required from "Penawaran dikirim" on; the dialog asks for it instead of failing.
    if (to !== "PROSPECT" && BigInt(card.estimatedValue) <= 0n) {
      openDialog({ mode: { kind: "move", to }, card });
      return;
    }
    setMoved({ card, to });
    const result = await transitionDealAction({ dealId: card.id, expectedVersion: card.version, toStatus: to });
    if (!result.ok) {
      setMoved(null);
      toast(result.error.message, "error");
      if (result.error.code === "CONFLICT") router.refresh();
      return;
    }
    toast(`Deal dipindahkan ke ${DEAL_STAGE[to].label}`, "success");
    router.refresh();
  }

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
          const remaining = stage.count + shiftOf(stage) - cards.length;
          return (
            <section
              key={stage.status}
              className={cn("column", mobileStage === stage.status && "is-mobile-active", dragging && over === stage.status && "is-drop")}
              aria-label={DEAL_STAGE[stage.status].label}
              onDragOver={(event) => dragOverColumn(event, stage.status)}
              onDragLeave={(event) => dragLeaveColumn(event, stage.status)}
              onDrop={(event) => dropOnColumn(event, stage.status)}
            >
              <div className="column-head">
                <div className="row">
                  <StageGlyph tone={DEAL_STAGE[stage.status].tone} />
                  <strong>{DEAL_STAGE[stage.status].label}</strong>
                  <Count>{stage.count + shiftOf(stage)}</Count>
                </div>
                <small>
                  {stage.count + shiftOf(stage)} deal · {formatRupiah(valueOf(stage))}
                </small>
              </div>
              {cards.length === 0 ? (
                <p className="quiet-empty">{filters.held ? "Tidak ada yang ditahan." : "Belum ada deal."}</p>
              ) : (
                cards.map((card) => {
                  const held = card.onHoldUntil !== null;
                  return (
                    <article
                      key={card.id}
                      className={cn("deal-card", held && "is-held", dragging?.id === card.id && "is-dragging")}
                      draggable={!held}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(DRAG_TYPE, card.id);
                        setDragging(card);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    >
                      <div className="deal-card-head">
                        <small title={card.customerName}>{card.customerName}</small>
                        <Menu label="Menu tindakan">
                          {held
                            ? null
                            : ACTIVE_DEAL_STAGES.filter((to) => to !== stage.status).map((to) => (
                                <MenuItem key={to} onSelect={() => openDialog({ mode: { kind: "move", to }, card })}>
                                  Pindah ke {DEAL_STAGE[to].label}
                                </MenuItem>
                              ))}
                          {held ? null : <MenuItem onSelect={() => openDialog({ mode: { kind: "won" }, card })}>Konfirmasi menang</MenuItem>}
                          <MenuItem onSelect={() => openContact("schedule", card)}>Jadwalkan tugas</MenuItem>
                          <MenuItem onSelect={() => openContact("whatsapp", card)}>Buka WhatsApp</MenuItem>
                          <MenuItem onSelect={() => openDialog({ mode: { kind: "hold" }, card })}>{held ? "Perpanjang penundaan" : "Tahan dulu"}</MenuItem>
                          <MenuItem danger onSelect={() => openDialog({ mode: { kind: "lost" }, card })}>
                            Tidak dilanjutkan
                          </MenuItem>
                        </Menu>
                      </div>
                      <h3>
                        <Link href={`/deals/${card.id}`} draggable={false}>
                          {card.title}
                        </Link>
                      </h3>
                      <div className="deal-card-value">
                        <b className="money">{BigInt(card.estimatedValue) > 0n ? formatRupiah(card.estimatedValue) : "Nilai belum diisi"}</b>
                        {card.hasQuotation ? <FileText aria-label="Sudah memiliki quotation" role="img" /> : null}
                      </div>
                      {held || card.signals.length ? (
                        <div className="deal-card-tags">
                          {held && !card.signals.length ? (
                            <Badge tone="neutral">
                              Ditunda s.d. {formatDate(card.onHoldUntil!)}
                            </Badge>
                          ) : null}
                          {card.signals.slice(0, 2).map((signal) => (
                            <Badge key={signal} tone={DEAL_SIGNAL[signal]?.tone}>
                              {DEAL_SIGNAL[signal]?.label ?? signal}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="deal-card-foot">
                        <Avatar name={card.assignedToName} />
                        <small>Aktivitas {lowerFirst(formatRelative(card.lastActivityAt))}</small>
                      </div>
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
          today={today}
          deal={{
            id: dialog.card.id,
            title: dialog.card.title,
            customerName: dialog.card.customerName,
            status: dialog.card.status,
            version: dialog.card.version,
            estimatedValue: dialog.card.estimatedValue,
            onHoldUntil: dialog.card.onHoldUntil,
          }}
        />
      ) : null}
    </>
  );
}
