import type { ReactNode } from "react";
import type { BadgeTone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn("badge", tone !== "neutral" && `b-${tone}`, className)}>{children}</span>;
}
