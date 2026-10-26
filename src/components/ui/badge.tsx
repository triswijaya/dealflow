import { Check, CircleAlert, CircleDashed, Dot, Info, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { BadgeTone } from "@/lib/labels";
import { cn } from "@/lib/utils";

// A status is never colour alone: every tone carries a glyph and the label.
const GLYPH: Record<BadgeTone, LucideIcon> = {
  neutral: Dot,
  outline: Dot,
  info: Info,
  brand: CircleDashed,
  success: Check,
  warning: CircleAlert,
  danger: X,
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const Glyph = GLYPH[tone];
  return (
    <span className={cn("badge", tone !== "neutral" && `b-${tone}`, className)}>
      <Glyph aria-hidden="true" />
      {children}
    </span>
  );
}

/** A black count badge: lane totals, unread counts, active filters. */
export function Count({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span className="count" aria-label={label}>
      {children}
    </span>
  );
}
