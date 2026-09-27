import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "error" | "success";

const ICON = { info: Info, warning: TriangleAlert, error: CircleX, success: CircleCheck };

/** Status is conveyed by icon and text, never color alone (UX-04). */
export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const Icon = ICON[tone];
  return (
    <div className={cn("alert", tone !== "info" && tone, className)} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
