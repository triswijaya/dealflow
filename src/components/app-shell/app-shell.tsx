"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, ChevronsUpDown, Ellipsis, LogOut, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { createContext, Fragment, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { Count } from "@/components/ui/badge";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { ROLE_LABEL, type Role } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { GlobalSearchBox } from "./global-search";
import { NAV_GROUP_LABEL, SEARCH_READY, bottomNavItems, sectionFor, sidebarItems, type NavGroup, type NavItem } from "./nav";

export type ShellWorkspace = {
  userName: string;
  userEmail: string;
  emailVerified: boolean;
  organizationName: string;
  role: Role;
};

const BreadcrumbContext = createContext<(trail: string[]) => void>(() => {});

/** Lets a detail page append its own title to the topbar breadcrumb. */
export function SetBreadcrumb({ trail }: { trail: string[] }) {
  const set = useContext(BreadcrumbContext);
  const key = trail.join("\u0000");
  useEffect(() => {
    set(key.split("\u0000"));
    return () => set([]);
  }, [key, set]);
  return null;
}

// The collapsed state is a per-user preference kept in the browser.
const SIDEBAR_KEY = "dealflow.sidebar";
const sidebarListeners = new Set<() => void>();
function subscribeSidebar(onChange: () => void) {
  sidebarListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    sidebarListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}
function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Private windows can refuse storage; the toggle then only lasts until reload.
  }
  sidebarListeners.forEach((listener) => listener());
}

async function signOut(router: ReturnType<typeof useRouter>) {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        router.push("/");
        router.refresh();
      },
    },
  });
}

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link className={cn("navitem", active && "active")} href={item.href} title={item.label} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" />
      <span className="navtext">{item.label}</span>
      {badge ? <Count label={`${badge} follow-up perlu ditindaklanjuti`}>{badge}</Count> : null}
    </Link>
  );
}

function VerifyEmailBanner({ email }: { email: string }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  return (
    <Alert tone="info">
      Verifikasi email Anda untuk mengamankan akun.{" "}
      <button
        type="button"
        className="btn tertiary"
        disabled={sending}
        onClick={async () => {
          setSending(true);
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email?verified=1" });
          setSending(false);
          toast(error ? "Gagal mengirim email. Coba lagi dalam beberapa menit." : "Email verifikasi dikirim.", error ? "error" : "success");
        }}
      >
        {sending ? "Mengirim..." : "Kirim ulang email"}
      </button>
    </Alert>
  );
}

/** The account chip at the foot of the sidebar; its menu opens upward. */
function UserMenu({ workspace }: { workspace: ShellWorkspace }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="usermenu">
      <button
        ref={button}
        type="button"
        className="user-chip"
        title={workspace.userName}
        aria-label={`Menu akun ${workspace.userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={workspace.userName} />
        <span className="usertext">
          <strong>{workspace.userName}</strong>
          <small>{ROLE_LABEL[workspace.role]}</small>
        </span>
        <ChevronsUpDown className="chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu-content">
          <div className="menu-meta">
            <strong>{workspace.userName}</strong>
            <small>{workspace.userEmail}</small>
          </div>
          <div role="menu" aria-label="Akun">
            <button type="button" role="menuitem" onClick={() => signOut(router)}>
              <LogOut aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  workspace,
  followUpBadge,
  demoMode,
  children,
}: {
  workspace: ShellWorkspace;
  followUpBadge?: number;
  demoMode?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [trail, setTrail] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);

  // Cmd/Ctrl + \ folds the sidebar, as the toggle does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        writeSidebarCollapsed(!readSidebarCollapsed());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const items = sidebarItems(workspace.role);
  const bottom = bottomNavItems(workspace.role);
  const section = sectionFor(pathname, workspace.role);
  const isActive = (item: NavItem) => section?.href === item.href;
  const badgeFor = (item: NavItem) => (item.badge === "followUps" ? followUpBadge : undefined);

  // Consecutive items of one group render under one label.
  const groups: [NavGroup, NavItem[]][] = [];
  for (const item of items) {
    const group = item.group ?? "main";
    if (group === "system") continue;
    const last = groups[groups.length - 1];
    if (last && last[0] === group) last[1].push(item);
    else groups.push([group, [item]]);
  }
  const systemItems = items.filter((item) => item.group === "system");

  return (
    <BreadcrumbContext.Provider value={setTrail}>
      <ToastProvider>
        <a className="skip-link" href="#konten">
          Lewati ke konten
        </a>
        <div className="app" data-collapsed={collapsed}>
          <aside className="sidebar" id="sidebar">
            <div className="sidebar-head">
              <Brand href="/dashboard" />
              <button
                type="button"
                className="iconbtn collapse-toggle"
                aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
                title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
                aria-controls="sidebar"
                aria-expanded={!collapsed}
                aria-keyshortcuts="Control+\ Meta+\"
                onClick={() => writeSidebarCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              </button>
            </div>
            <nav aria-label="Navigasi utama">
              {groups.map(([group, list]) => (
                <div key={group} className="nav-group">
                  {NAV_GROUP_LABEL[group] ? <div className="nav-label">{NAV_GROUP_LABEL[group]}</div> : null}
                  {list.map((item) => (
                    <NavLink key={item.href + item.label} item={item} active={isActive(item)} badge={badgeFor(item)} />
                  ))}
                </div>
              ))}
            </nav>
            <div className="sidebar-foot">
              {systemItems.length > 0 ? (
                <nav aria-label="Pengaturan">
                  {systemItems.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item)} />
                  ))}
                </nav>
              ) : null}
              <div className="nav-group">
                <div className="nav-label">Akun</div>
                <UserMenu workspace={workspace} />
              </div>
            </div>
          </aside>

          <div className="panel">
            <div className="panel-scroll">
              <div className="topbar-wrap">
                <header className="topbar">
                  <nav className="breadcrumb" aria-label="Breadcrumb">
                    <span>{workspace.organizationName}</span>
                    {section ? (
                      <>
                        <ChevronRight aria-hidden="true" />
                        {trail.length > 0 ? (
                          <Link href={section.href}>{section.label}</Link>
                        ) : (
                          <span aria-current="page">
                            <section.icon aria-hidden="true" />
                            {section.label}
                          </span>
                        )}
                      </>
                    ) : null}
                    {trail.map((crumb, index) => (
                      <Fragment key={`${crumb}-${index}`}>
                        <ChevronRight aria-hidden="true" />
                        <span aria-current={index === trail.length - 1 ? "page" : undefined}>{crumb}</span>
                      </Fragment>
                    ))}
                  </nav>
                  <div className="topbar-actions">
                    {SEARCH_READY ? <GlobalSearchBox /> : null}
                    {followUpBadge !== undefined ? (
                      <Link
                        className="iconbtn square"
                        href="/follow-ups"
                        aria-label={followUpBadge ? `Follow-up, ${followUpBadge} perlu ditindaklanjuti` : "Follow-up"}
                        title="Follow-up"
                      >
                        <Bell aria-hidden="true" />
                        {followUpBadge ? <span className="signal" aria-hidden="true" /> : null}
                      </Link>
                    ) : null}
                  </div>
                </header>
              </div>

              <div className="mobile-top">
                <Brand href="/dashboard" />
                <div className="row" style={{ gap: 8 }}>
                  {SEARCH_READY ? (
                    <Link className="iconbtn square" href="/search" aria-label="Pencarian global" title="Pencarian global">
                      <Search aria-hidden="true" />
                    </Link>
                  ) : null}
                  <Avatar name={workspace.userName} />
                </div>
              </div>

              <main className="main" id="konten">
                {!workspace.emailVerified || demoMode ? (
                  <div className="shell-notices">
                    {!workspace.emailVerified ? <VerifyEmailBanner email={workspace.userEmail} /> : null}
                    {demoMode ? <Alert tone="info">Mode demo: data fiktif dan direset berkala.</Alert> : null}
                  </div>
                ) : null}
                {children}
              </main>
            </div>
          </div>
        </div>

        <nav className="bottomnav" aria-label="Navigasi mobile">
          {bottom.primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn(isActive(item) && "active")} aria-current={isActive(item) ? "page" : undefined}>
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <Ellipsis aria-hidden="true" />
            Lainnya
          </button>
        </nav>

        <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Lainnya">
          <nav className="stack" style={{ gap: 2 }} aria-label="Menu lainnya">
            {bottom.more.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} className={cn("navitem", isActive(item) && "active")} href={item.href} onClick={() => setMoreOpen(false)}>
                  <Icon aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" className="navitem" style={{ border: 0, background: "none", width: "100%" }} onClick={() => signOut(router)}>
              <LogOut aria-hidden="true" />
              Keluar
            </button>
          </nav>
        </Dialog>
      </ToastProvider>
    </BreadcrumbContext.Provider>
  );
}
