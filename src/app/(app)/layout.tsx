import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { AccessRevoked } from "@/components/system-pages";
import { loadWorkspaceState } from "./workspace";

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
        demoMode={process.env.APP_ENV === "demo"}
      >
        {children}
      </AppShell>
    </div>
  );
}
