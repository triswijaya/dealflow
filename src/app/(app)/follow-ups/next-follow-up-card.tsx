"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { followUpTypeLabel } from "@/lib/labels";
import type { DealOptionDto } from "@/server/deals/deal-views";
import type { FollowUpRowDto } from "@/server/follow-ups/follow-up-views";
import { CompleteFollowUpDialog, ScheduleFollowUpButton } from "./follow-up-dialogs";

/** The deal page's "Follow-up berikutnya": the next open reminder, with the two things you do to it. */
export function NextFollowUpCard({
  next,
  deal,
  timezone,
  canSchedule,
}: {
  next: FollowUpRowDto | null;
  deal: DealOptionDto;
  timezone: string;
  canSchedule: boolean;
}) {
  const [completing, setCompleting] = useState(false);
  return (
    <Card>
      <h2>Follow-up berikutnya</h2>
      {next ? (
        <>
          <p>{formatDateTime(next.followUpAt, timezone)}</p>
          <p className="muted">
            {next.note?.trim() ? `${next.note} · ` : ""}
            {followUpTypeLabel(next.type)}
          </p>
          <Button variant="secondary" onClick={() => setCompleting(true)} style={{ marginTop: 12 }}>
            Tandai selesai
          </Button>
          <CompleteFollowUpDialog open={completing} onClose={() => setCompleting(false)} followUp={next} timezone={timezone} />
        </>
      ) : (
        <>
          <p className="muted">Belum ada jadwal follow-up berikutnya.</p>
          {canSchedule ? (
            <div style={{ marginTop: 12 }}>
              <ScheduleFollowUpButton variant="tertiary" timezone={timezone} deal={deal} />
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
