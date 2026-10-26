import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The same person always gets the same pastel family (DESIGN.md 3.8). */
function hueOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 7;
}

export function Avatar({ name, size, className }: { name: string; size?: "xs" | "sm" | "lg"; className?: string }) {
  return (
    <span className={cn("avatar", `av-${hueOf(name)}`, size, className)} title={name} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PersonName({ name }: { name: string }) {
  return (
    <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <Avatar name={name} />
      <span>{name}</span>
    </span>
  );
}

/** Page header (DESIGN.md 8.5): one title, one line of description, actions on the right, a hairline below. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row actions">{actions}</div> : null}
    </header>
  );
}

/** Detail page header (DESIGN.md 8.5, variant D): back button, title with its status beside it, actions on the right. */
export function DetailHeader({
  backHref,
  backLabel,
  title,
  titleClassName,
  badge,
  description,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: ReactNode;
  titleClassName?: string;
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div className="detail-head">
        <Link className="iconbtn" href={backHref} aria-label={backLabel} title={backLabel}>
          <ChevronLeft aria-hidden="true" />
        </Link>
        <div>
          <div className="title-row">
            <h1 className={titleClassName} style={{ overflowWrap: "anywhere" }}>
              {title}
            </h1>
            {badge}
          </div>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="row actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="card skeleton" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skel" />
      ))}
    </div>
  );
}

/** URL-driven filter chip: state lives in the query string (FILTER-01). */
export function ChipLink({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={cn("chip", active && "active")} aria-current={active ? "true" : undefined}>
      {children}
    </Link>
  );
}

export function TabLinks({ tabs }: { tabs: { href: string; label: ReactNode; active: boolean }[] }) {
  return (
    <nav className="tabs" aria-label="Tab">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={cn(tab.active && "active")} aria-current={tab.active ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
