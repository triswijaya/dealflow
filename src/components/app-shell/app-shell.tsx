"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ellipsis, LogOut, Search } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { GlobalSearchBox } from "./global-search";
import { SEARCH_READY, bottomNavItems, sectionFor, sidebarItems, type NavItem } from "./nav";

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
      {badge ? (
        <span className="badge" aria-label={`${badge} follow-up perlu ditindaklanjuti`}>
          {badge}
        </span>
      ) : null}
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const items = sidebarItems(workspace.role);
  const bottom = bottomNavItems(workspace.role);
  const section = sectionFor(pathname, workspace.role);
  const isActive = (item: NavItem) => section?.href === item.href;
  const badgeFor = (item: NavItem) => (item.badge === "followUps" ? followUpBadge : undefined);
  const crumbs = ["Workspace", ...(section ? [section.label] : []), ...trail];

  return (
    <BreadcrumbContext.Provider value={setTrail}>
      <ToastProvider>
        <a className="skip-link" href="#konten">
          Lewati ke konten
        </a>
        <aside className="sidebar">
          <Brand href="/dashboard" />
          <div className="org">
            <span className="avatar" title={workspace.organizationName} aria-hidden="true">
              {initials(workspace.organizationName)}
            </span>
            <div>
              <strong>{workspace.organizationName}</strong>
              <small style={{ display: "block" }}>Ruang kerja perusahaan</small>
            </div>
          </div>
          <div className="eyebrow">Workspace</div>
          <nav aria-label="Navigasi utama">
            {items.map((item) => (
              <NavLink key={item.href + item.label} item={item} active={isActive(item)} badge={badgeFor(item)} />
            ))}
          </nav>
          <div className="user usermenu">
            <button
              type="button"
              className="row"
              style={{ border: 0, background: "none", padding: 0, width: "100%", textAlign: "left", flexWrap: "nowrap" }}
              aria-label={`Menu akun ${workspace.userName}`}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <Avatar name={workspace.userName} />
              <span className="usertext" style={{ minWidth: 0 }}>
                <strong style={{ display: "block", overflowWrap: "anywhere" }}>{workspace.userName}</strong>
                <small style={{ display: "block" }}>{ROLE_LABEL[workspace.role]}</small>
              </span>
            </button>
            {userMenuOpen ? (
              <div className="menu-content" role="menu">
                <button type="button" role="menuitem" onClick={() => signOut(router)}>
                  <LogOut aria-hidden="true" />
                  Keluar
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="workspace">
          <div className="topbar">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`}>
                  {index > 0 ? <span style={{ margin: "0 8px" }}>/</span> : null}
                  {crumb}
                </span>
              ))}
            </nav>
            {SEARCH_READY ? <GlobalSearchBox /> : <span />}
            <span className="row" style={{ gap: 8 }}>
              <small>{workspace.organizationName}</small>
            </span>
          </div>

          <div className="mobile-top">
            <Brand href="/dashboard" />
            <div className="row">
              {SEARCH_READY ? (
                <Link className="iconbtn" href="/search" aria-label="Pencarian global" title="Pencarian global">
                  <Search aria-hidden="true" />
                </Link>
              ) : null}
              <Avatar name={workspace.userName} />
            </div>
          </div>

          <main className="main" id="konten">
            {!workspace.emailVerified || demoMode ? (
              <div className="stack" style={{ gap: 10, marginBottom: 22 }}>
                {!workspace.emailVerified ? <VerifyEmailBanner email={workspace.userEmail} /> : null}
                {demoMode ? <Alert tone="info">Mode demo: data fiktif dan direset berkala.</Alert> : null}
              </div>
            ) : null}
            {children}
          </main>
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
          <nav className="stack" style={{ gap: 4 }} aria-label="Menu lainnya">
            {bottom.more.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} className="btn tertiary" style={{ justifyContent: "flex-start" }} href={item.href} onClick={() => setMoreOpen(false)}>
                  <Icon aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" className="btn tertiary" style={{ justifyContent: "flex-start" }} onClick={() => signOut(router)}>
              <LogOut aria-hidden="true" />
              Keluar
            </button>
          </nav>
          <button type="button" className="btn secondary wfull" style={{ marginTop: 16 }} onClick={() => setMoreOpen(false)}>
            Tutup
          </button>
        </Dialog>
      </ToastProvider>
    </BreadcrumbContext.Provider>
  );
}
