import { Building2, CalendarClock, FileText, Handshake, Kanban, LayoutGrid, Receipt, Settings, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/labels";

export type NavItem = { key: string; href: string; label: string; icon: LucideIcon; badge?: "followUps" };

const ITEMS: Record<string, NavItem> = {
  dashboard: { key: "dashboard", href: "/dashboard", label: "Ringkasan", icon: LayoutGrid },
  pipeline: { key: "pipeline", href: "/pipeline", label: "Pipeline", icon: Kanban },
  deals: { key: "deals", href: "/deals", label: "Deal", icon: Handshake },
  wonDeals: { key: "deals", href: "/deals", label: "Deal menang", icon: Handshake },
  customers: { key: "customers", href: "/customers", label: "Customer", icon: Building2 },
  quotations: { key: "quotations", href: "/quotations", label: "Penawaran", icon: FileText },
  followUps: { key: "follow-ups", href: "/follow-ups", label: "Follow-up", icon: CalendarClock, badge: "followUps" },
  invoices: { key: "invoices", href: "/invoices", label: "Invoice", icon: Receipt },
  settings: { key: "settings", href: "/settings/company", label: "Pengaturan", icon: Settings },
};

// Pages that exist today. A sidebar entry for a module that is still being
// built is left out rather than leading to a 404; add the path here when its
// page ships. Same for the global search box.
const BUILT_PATHS = new Set(["/dashboard", "/customers", "/pipeline", "/deals", "/quotations", "/follow-ups", "/invoices", "/settings/company", "/settings/members"]);

/** For links to a module that may not have its pages yet. */
export function isBuilt(path: string): boolean {
  return BUILT_PATHS.has(path);
}
export const SEARCH_READY = true;

// Brief §4.1: menus follow the role. Hiding a link is navigation only; every
// page and action still checks permission on the server (RBAC-01).
export function sidebarItems(role: Role): NavItem[] {
  return roleItems(role).filter((item) => BUILT_PATHS.has(item.href));
}

function roleItems(role: Role): NavItem[] {
  const i = ITEMS;
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return [i.dashboard, i.pipeline, i.deals, i.customers, i.quotations, i.followUps, i.invoices, i.settings];
    case "SALES":
      return [i.dashboard, i.pipeline, i.deals, i.customers, i.quotations, i.followUps];
    case "FINANCE":
      return [i.dashboard, i.wonDeals, i.customers, i.invoices];
  }
}

// Brief §5.5: five bottom-nav slots; the rest live behind "Lainnya".
export function bottomNavItems(role: Role): { primary: NavItem[]; more: NavItem[] } {
  const all = sidebarItems(role);
  const primaryKeys = role === "FINANCE" ? ["dashboard", "deals", "customers", "invoices"] : ["dashboard", "pipeline", "customers", "follow-ups"];
  return {
    primary: primaryKeys.map((key) => all.find((item) => item.key === key)!).filter(Boolean),
    more: all.filter((item) => !primaryKeys.includes(item.key)),
  };
}

export function sectionFor(pathname: string, role: Role): NavItem | undefined {
  const items = sidebarItems(role);
  if (pathname.startsWith("/settings")) return items.find((item) => item.key === "settings");
  if (pathname.startsWith("/search")) return { key: "search", href: "/search", label: "Pencarian", icon: LayoutGrid };
  return items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
