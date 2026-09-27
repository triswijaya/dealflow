import { LoginForm } from "./login-form";

const NOTICES: Record<string, string> = {
  session: "Sesi Anda berakhir. Silakan masuk kembali.",
  "password-reset": "Password berhasil diubah. Silakan masuk dengan password baru.",
};

// Only same-origin paths are honored, so the parameter cannot become an
// open redirect.
function safeNext(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  return <LoginForm notice={reason ? NOTICES[reason] : undefined} next={safeNext(params.next)} />;
}
