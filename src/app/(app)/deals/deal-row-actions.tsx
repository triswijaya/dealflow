"use client";

import { useState } from "react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ACTIVE_DEAL_STAGES, DEAL_STAGE, isActiveStage, type Role } from "@/lib/labels";
import type { DealRowDto } from "@/server/deals/deal-views";
import { DealTransitionDialog, type TransitionMode } from "./transition-dialog";

/** The ⋯ menu on an open deal's row; closed deals are opened from the detail page. */
export function DealRowActions({ deal, role, today }: { deal: DealRowDto; role: Role; today: string }) {
  const [mode, setMode] = useState<TransitionMode>({ kind: "lost" });
  const [open, setOpen] = useState(false);
  if (!isActiveStage(deal.status)) return null;
  const held = deal.onHoldUntil !== null;

  const start = (chosen: TransitionMode) => {
    setMode(chosen);
    setOpen(true);
  };

  return (
    <>
      <Menu label="Menu tindakan">
        <MenuItem href={`/deals/${deal.id}`}>Buka</MenuItem>
        <MenuItem href={`/deals/${deal.id}?edit=1`}>Edit</MenuItem>
        {held
          ? null
          : ACTIVE_DEAL_STAGES.filter((stage) => stage !== deal.status).map((stage) => (
              <MenuItem key={stage} onSelect={() => start({ kind: "move", to: stage })}>
                Pindah ke {DEAL_STAGE[stage].label}
              </MenuItem>
            ))}
        {held ? null : <MenuItem onSelect={() => start({ kind: "won" })}>Konfirmasi menang</MenuItem>}
        <MenuItem onSelect={() => start({ kind: "hold" })}>{held ? "Perpanjang penundaan" : "Tahan dulu"}</MenuItem>
        <MenuItem danger onSelect={() => start({ kind: "lost" })}>
          Tidak dilanjutkan
        </MenuItem>
      </Menu>
      <DealTransitionDialog
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        role={role}
        today={today}
        deal={{
          id: deal.id,
          title: deal.title,
          customerName: deal.customerName,
          status: deal.status,
          version: deal.version,
          estimatedValue: deal.estimatedValue,
          onHoldUntil: deal.onHoldUntil,
        }}
      />
    </>
  );
}
