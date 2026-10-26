import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Hue = "violet" | "indigo" | "sky" | "mint" | "butter" | "coral" | "copper";
export type Status = "success" | "pending" | "warning" | "caution" | "danger" | "info" | "neutral";

/**
 * Metric card (DESIGN.md 9.7.1): a category marker and title, then one value
 * and its label. The whole card is a link when it has an href.
 */
export function MetricCard({
  icon: Icon,
  hue,
  title,
  value,
  label,
  href,
  hint,
  danger,
}: {
  icon: LucideIcon;
  hue: Hue;
  title: string;
  value: ReactNode;
  label?: ReactNode;
  href?: string;
  /** Exact value shown on hover when the card abbreviates it. */
  hint?: string;
  danger?: boolean;
}) {
  const body = (
    <>
      <div className="metric-head">
        <span className="marker" data-hue={hue}>
          <Icon aria-hidden="true" />
        </span>
        <h3>{title}</h3>
      </div>
      <div>
        <strong className="metric-value">{value}</strong>
        {label ? <span className="metric-label">{label}</span> : null}
      </div>
    </>
  );
  const className = cn("metric-card", danger && "is-danger");
  return href ? (
    <Link className={className} href={href} title={hint}>
      {body}
    </Link>
  ) : (
    <div className={className} title={hint}>
      {body}
    </div>
  );
}

/**
 * Status tile (DESIGN.md 9.7.2): a pastel wash, a white icon chip, a value and
 * a label. As a link it acts as a filter; `selected` draws the ink ring.
 */
export function StatusTile({
  status,
  icon: Icon,
  value,
  label,
  href,
  selected,
}: {
  status: Status;
  icon: LucideIcon;
  value: ReactNode;
  label: ReactNode;
  href?: string;
  selected?: boolean;
}) {
  const body = (
    <>
      <span className="icon-chip">
        <Icon aria-hidden="true" />
      </span>
      <span className="tile-text">
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      {href ? <ChevronRight className="chev" aria-hidden="true" /> : null}
    </>
  );
  return href ? (
    <Link className="status-tile" data-status={status} href={href} aria-current={selected ? "true" : undefined}>
      {body}
    </Link>
  ) : (
    <div className="status-tile" data-status={status}>
      {body}
    </div>
  );
}
