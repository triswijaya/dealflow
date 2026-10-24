import { Building2, CalendarClock, FileText, Handshake, Kanban, LayoutGrid, Receipt, Settings, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/labels";

// Sidebar sections. "system" items sit at the foot of the sidebar, above the account chip.
export type NavGroup = "main" | "sales" | "finance" | "system";
export type NavItem = { key: string; href: string; label: string; icon: LucideIcon; group?: NavGroup; badge?: "followUps" };

export const NAV_GROUP_LABEL: Record<NavGroup, string | null> = { main: null, sales: "Penjualan", finance: "Keuangan", system: null };

const ITEMS: Record<string, NavItem> = {
  dashboard: { key: "dashboard", href: "/dashboard", label: "Ringkasan", icon: LayoutGrid, group: "main" },
  pipeline: { key: "pipeline", href: "/pipeline", label: "Pipeline", icon: Kanban, group: "sales" },
  deals: { key: "deals", href: "/deals", label: "Deal", icon: Handshake, group: "sales" },
  wonDeals: { key: "deals", href: "/deals", label: "Deal menang", icon: Handshake, group: "sales" },
  customers: { key: "customers", href: "/customers", label: "Customer", icon: Building2, group: "sales" },
  quotations: { key: "quotations", href: "/quotations", label: "Penawaran", icon: FileText, group: "sales" },
  followUps: { key: "follow-ups", href: "/follow-ups", label: "Follow-up", icon: CalendarClock, group: "sales", badge: "followUps" },
  invoices: { key: "invoices", href: "/invoices", label: "Invoice", icon: Receipt, group: "finance" },
  settings: { key: "settings", href: "/settings/company", label: "Pengaturan", icon: Settings, group: "system" },
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
