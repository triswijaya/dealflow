import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/server/auth/auth";
import { getWorkspaceState } from "@/server/workspace/workspace";
import { OnboardingRunner } from "./onboarding-runner";

export const metadata = { title: "Menyiapkan organisasi" };

export default async function OnboardingPage() {
  const state = await getWorkspaceState(await headers());
  if (state.status === "anonymous") redirect("/login");
  if (state.status !== "no-membership") redirect("/dashboard");

  const knownName = Boolean((await cookies()).get("df_company")?.value);
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <AuthShell variant="state">
      <OnboardingRunner knownName={knownName} email={session?.user.email ?? ""} />
    </AuthShell>
  );
}
