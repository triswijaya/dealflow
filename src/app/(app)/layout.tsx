import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { AccessRevoked } from "@/components/system-pages";
import { getFollowUpBadgeCount } from "@/server/follow-ups/follow-up-views";
import { loadWorkspaceState } from "./workspace";

// Everything here is behind a sign-in; keep it out of search results even if a link leaks.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const state = await loadWorkspaceState();
  if (state.status === "anonymous") {
    redirect("/login?reason=session");
  }
  if (state.status === "no-membership") {
    redirect("/onboarding");
  }
  if (state.status === "deactivated") {
    // AUTH-06: a deactivated member keeps their session cookie until it
    // expires, so this must be a full-screen stop, not a partial page.
    return (
      <div className="df" style={{ minHeight: "100svh" }}>
        <AccessRevoked />
      </div>
    );
  }

  const { workspace } = state;
  // The sidebar badge counts today's and overdue follow-ups. Finance has no
  // follow-up access, and a failed count must never take the page down.
  const followUpBadge =
    workspace.role === "FINANCE"
      ? undefined
      : await getFollowUpBadgeCount({ headers: await headers() }).catch(() => undefined);

  return (
    <div className="df" style={{ minHeight: "100svh" }}>
      <AppShell
        workspace={{
          userName: workspace.user.name,
          userEmail: workspace.user.email,
          emailVerified: workspace.user.emailVerified,
          organizationName: workspace.organization.name,
          role: workspace.role,
        }}
        followUpBadge={followUpBadge}
        demoMode={process.env.APP_ENV === "demo"}
      >
        {children}
      </AppShell>
    </div>
  );
}
