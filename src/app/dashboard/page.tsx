import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Masuk sebagai</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{session.user.name}</h1>
        <p className="mt-4 max-w-sm text-muted-foreground">
          Customer, deal pipeline, quotation, dan dashboard akan segera hadir di sini.
        </p>
      </div>
      <LogoutButton />
    </main>
  );
}
