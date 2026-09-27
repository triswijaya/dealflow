"use server";

import { redirect } from "next/navigation";
import { registerOwner } from "@/server/auth/register-owner";

export type RegisterState = {
  error: string | null;
};

const MIN_PASSWORD_LENGTH = 12;

/**
 * AUTH-01/AUTH-02: creates the owner account, organization, default
 * settings, and OWNER membership in one call (registerOwner is itself
 * idempotent/resumable), then relies on the nextCookies plugin in auth.ts
 * to set the session cookie from the signUp/signIn call inside it -- this
 * action never touches cookies() directly.
 *
 * One generic error message for every failure (weak password, duplicate
 * email with a wrong password, unexpected error): distinguishing them here
 * would let a failed attempt reveal whether an email is already registered.
 */
export async function registerOwnerAction(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !companyName || !email || !password) {
    return { error: "Semua field wajib diisi." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.` };
  }

  try {
    await registerOwner({ name, companyName, email, password });
  } catch {
    return { error: "Registrasi tidak berhasil. Periksa kembali data Anda, atau coba lagi." };
  }

  redirect("/dashboard");
}
