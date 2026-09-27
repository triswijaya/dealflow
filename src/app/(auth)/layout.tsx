import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { BrandMark } from "@/components/brand";
import Link from "next/link";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="df" style={{ minHeight: "100svh" }}>
      <main className="auth-page">
        <div className="auth-stage">
          <div className="brand-panel">
            <Link className="brand" href="/" aria-label="DealFlow">
              <BrandMark />
              <span>dealflow</span>
            </Link>
            <div>
              <div className="eyebrow" style={{ color: "#C6F135" }}>
                Setiap peluang, lebih dekat
              </div>
              <h2 style={{ marginTop: 15 }}>Dari calon customer sampai pembayaran, dalam satu alur.</h2>
              <div className="brand-art" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <p>Ruang kerja yang rapi. Percakapan yang berarti.</p>
          </div>
          <div className="auth-form">
            <Link className="brand" href="/" aria-label="DealFlow">
              <BrandMark />
              <span>dealflow</span>
            </Link>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
