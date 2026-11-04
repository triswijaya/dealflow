import { ChevronLeft } from "lucide-react";
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

/**
 * The state block (DESIGN.md 9.18): a faint sketch of the rows that will fill
 * this space, then title, description, actions, centred. No icon chip: the
 * sketch is the same shape as the skeletons, so loading and empty read as one
 * family. "page" fills the content area under a page header; "region" sits
 * inside a section or a tab. The tone tints the sketch only: "success" for a
 * cleared list, "error" for a failed read.
 */
export function EmptyState({
  title,
  description,
  action,
  size = "page",
  tone = "neutral",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  size?: "page" | "region";
  tone?: "neutral" | "success" | "error";
}) {
  const Heading = size === "page" ? "h2" : "h3";
  return (
    <div className={cn("empty", size === "region" && "empty-region", tone !== "neutral" && `empty-${tone}`)}>
      <div className="empty-sketch" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Heading>{title}</Heading>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-actions">{action}</div> : null}
    </div>
  );
}

/** A quiet empty row: one calm line in tertiary text, no chip (DESIGN.md 8.11). */
export function QuietEmpty({ children }: { children: ReactNode }) {
  return <p className="quiet-empty">{children}</p>;
}

/* Loading placeholders drawn in the shape of the screen they stand in for, so
   nothing jumps when the data lands. Bars only; the real markup (pagehead,
   table, lanes, cards) supplies the spacing. */
function Bar({ w, h = 12 }: { w: number | string; h?: number }) {
  return <span className="skel" style={{ width: w, height: h }} />;
}

/* A fragment, not a wrapper, so the bars sit in the same .main > … slots as the
   real page and pick up its card and inset styles. The bars are empty spans,
   so screen readers hear only the status line. */
function Loading({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="sr-only" role="status">
        Memuat…
      </span>
      {children}
    </>
  );
}

function HeadSkeleton({ back, action = true }: { back?: boolean; action?: boolean }) {
  return (
    <div className="pagehead">
      <div className={back ? "detail-head" : undefined}>
        {back ? <Bar w={36} h={36} /> : null}
        <div>
          <Bar w={200} h={26} />
          <div style={{ marginTop: 10 }}>
            <Bar w={320} h={14} />
          </div>
        </div>
      </div>
      {action ? (
        <div className="row actions">
          <Bar w={120} h={36} />
        </div>
      ) : null}
    </div>
  );
}

const CELL_WIDTHS = ["72%", "56%", "64%", "40%", "48%"];

/** A list page: header, toolbar, then a table with real row heights. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Loading>
      <HeadSkeleton />
      <div className="toolbar">
        <Bar w={280} h={36} />
        <Bar w={112} h={36} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, column) => (
                <th key={column} className={column === columns - 1 ? "num" : undefined}>
                  <Bar w={column === 0 ? 96 : 64} h={10} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column} className={column === columns - 1 ? "num" : undefined}>
                    {column === 0 ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <Bar w={`${60 + ((row * 7) % 30)}%`} />
                        <Bar w="38%" h={10} />
                      </div>
                    ) : (
                      <Bar w={column === columns - 1 ? 88 : CELL_WIDTHS[(row + column) % CELL_WIDTHS.length]!} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Loading>
  );
}

/** The pipeline: four lanes of deal cards. */
export function BoardSkeleton() {
  return (
    <Loading>
      <HeadSkeleton />
      <div className="toolbar">
        <Bar w={240} h={36} />
        <Bar w={112} h={36} />
      </div>
      <div className="board">
        {[3, 2, 2, 1].map((cards, lane) => (
          <div key={lane} className="column">
            <div className="column-head">
              <div className="row">
                <Bar w={120} h={14} />
              </div>
            </div>
            {Array.from({ length: cards }, (_, card) => (
              <div key={card} className="deal-card" style={{ display: "grid", gap: 10 }}>
                <Bar w="45%" h={10} />
                <Bar w="80%" />
                <Bar w="35%" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A record page: back button and title, then the main card beside its rail. */
export function DetailSkeleton() {
  return (
    <Loading>
      <HeadSkeleton back />
      <div className="with-rail">
        <div className="rail-main">
          <section className="region" style={{ display: "grid", gap: 14 }}>
            <Bar w={140} h={16} />
            {CELL_WIDTHS.map((width, index) => (
              <Bar key={index} w={width} />
            ))}
          </section>
        </div>
        <div className="rail-side">
          <section className="region" style={{ display: "grid", gap: 14 }}>
            <Bar w={100} h={16} />
            <Bar w="70%" />
            <Bar w="50%" />
          </section>
        </div>
      </div>
    </Loading>
  );
}

/** A settings form: labels over full-width inputs in one card. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <Loading>
      <HeadSkeleton />
      <section className="region" style={{ display: "grid", gap: 20, maxWidth: "var(--settings-max)" }}>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} style={{ display: "grid", gap: 8 }}>
            <Bar w={96} h={10} />
            <Bar w="100%" h={36} />
          </div>
        ))}
      </section>
    </Loading>
  );
}

/** The dashboard: KPI cards, then the pipeline chart card. */
export function DashboardSkeleton() {
  return (
    <Loading>
      <HeadSkeleton />
      <div className="kpis">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="kpi" style={{ display: "grid", alignContent: "start", gap: 14 }}>
            <Bar w="60%" h={12} />
            <Bar w="45%" h={28} />
            <Bar w="70%" h={10} />
          </div>
        ))}
      </div>
      <section className="region" style={{ marginTop: "var(--grid-gap)", display: "grid", gap: 16 }}>
        <Bar w={200} h={12} />
        <Bar w={120} h={32} />
        <Bar w="100%" h={220} />
      </section>
    </Loading>
  );
}

/** Reports: period chips, metric cards, then the aging and export cards. */
export function ReportsSkeleton() {
  return (
    <Loading>
      <HeadSkeleton action={false} />
      <div className="chips" style={{ marginBottom: 24 }}>
        {[72, 88, 80, 96].map((width, index) => (
          <Bar key={index} w={width} h={32} />
        ))}
      </div>
      <div className="metrics">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="metric-card">
            <Bar w="55%" h={12} />
            <div style={{ display: "grid", gap: 10 }}>
              <Bar w="50%" h={24} />
              <Bar w="70%" h={10} />
            </div>
          </div>
        ))}
      </div>
      <section className="region" style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <Bar w={180} h={16} />
        <Bar w="100%" h={12} />
        <Bar w="60%" h={10} />
      </section>
    </Loading>
  );
}

/** A dashboard widget: its heading, then rows of avatar, two lines and a figure. */
export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <section className="region" role="status" aria-busy="true">
      <span className="sr-only">Memuat…</span>
      <div aria-hidden="true" style={{ display: "grid", gap: 16 }}>
        <Bar w={140} h={16} />
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className="row" style={{ flexWrap: "nowrap" }}>
            <Bar w={28} h={28} />
            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <Bar w={CELL_WIDTHS[index % CELL_WIDTHS.length]!} />
              <Bar w="30%" h={10} />
            </div>
            <Bar w={64} />
          </div>
        ))}
      </div>
    </section>
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
