import { Check } from "lucide-react";
import { formatDate } from "@/lib/format";
import { ACTIVE_DEAL_STAGES, DEAL_STAGE, type DealStage } from "@/lib/labels";
import { cn } from "@/lib/utils";

const PATH: DealStage[] = [...ACTIVE_DEAL_STAGES, "WON"];

/**
 * The deal's journey, one step per stage with the date it was entered. A won
 * deal completes the path; a lost deal shows the stages it reached and ends
 * on "Kalah", since the stages it never reached say nothing useful.
 */
export function DealStepper({
  status,
  enteredAt,
  timezone,
}: {
  status: string;
  enteredAt: Partial<Record<DealStage, string>>;
  timezone: string;
}) {
  const lost = status === "LOST";
  const steps: DealStage[] = lost ? [...ACTIVE_DEAL_STAGES.filter((stage) => enteredAt[stage]), "LOST"] : PATH;
  const currentIndex = steps.indexOf(status as DealStage);

  return (
    <ol className="stepper" aria-label="Tahap deal" style={{ listStyle: "none", margin: 0, padding: "10px 0 22px" }}>
      {steps.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        const date = enteredAt[stage];
        return (
          <li key={stage} className={cn("step", done && "done", current && "current")} aria-current={current ? "step" : undefined}>
            <b>{done ? <Check aria-hidden="true" /> : index + 1}</b>
            {DEAL_STAGE[stage].label}
            <small>{date ? formatDate(date, timezone) : "Belum masuk"}</small>
          </li>
        );
      })}
    </ol>
  );
}
