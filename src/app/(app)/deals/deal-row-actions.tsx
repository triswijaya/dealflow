"use client";

import { useState } from "react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { NEXT_DEAL_STAGE, isActiveStage, type Role } from "@/lib/labels";
import type { DealRowDto } from "@/server/deals/deal-views";
import { DealTransitionDialog, type TransitionMode } from "./transition-dialog";

/** The ⋯ menu on an open deal's row. Won and lost deals are final, so they only get "Buka". */
export function DealRowActions({ deal, role }: { deal: DealRowDto; role: Role }) {
  const [mode, setMode] = useState<TransitionMode>("advance");
  const [open, setOpen] = useState(false);
  if (!isActiveStage(deal.status)) return null;

  const next = NEXT_DEAL_STAGE[deal.status];
  const start = (chosen: TransitionMode) => {
    setMode(chosen);
    setOpen(true);
  };

  return (
    <>
      <Menu label="Menu tindakan">
        <MenuItem href={`/deals/${deal.id}`}>Buka</MenuItem>
        <MenuItem href={`/deals/${deal.id}?edit=1`}>Edit</MenuItem>
        <MenuItem onSelect={() => start(next.to === "WON" ? "won" : "advance")}>{next.to === "WON" ? "Tandai menang" : "Pindah tahap"}</MenuItem>
        <MenuItem danger onSelect={() => start("lost")}>
          Tandai kalah
        </MenuItem>
      </Menu>
      <DealTransitionDialog
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        role={role}
        deal={{
          id: deal.id,
          title: deal.title,
          customerName: deal.customerName,
          status: deal.status,
          version: deal.version,
          estimatedValue: deal.estimatedValue,
        }}
      />
    </>
  );
}
