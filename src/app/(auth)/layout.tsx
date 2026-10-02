import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { AuthShell } from "@/components/auth-shell";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return <AuthShell>{children}</AuthShell>;
}
