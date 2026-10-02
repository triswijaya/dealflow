import type { ReactNode } from "react";
import { Brand, BrandMark } from "@/components/brand";
import Link from "next/link";

/**
 * The frame around every signed-out screen. "split" is the brand panel next
 * to a form (login, register, forgot and reset password, accepting an
 * invitation); "state" is a single centred card for a short status message
 * (verifying, expired link, preparing the workspace).
 */
export function AuthShell({ children, variant = "split" }: { children: ReactNode; variant?: "split" | "state" }) {
  if (variant === "state") {
    return (
      <div className="df" style={{ minHeight: "100svh" }}>
        <main className="auth-page" style={{ justifyContent: "center" }}>
          <div className="auth-state stack" style={{ gap: 28, width: "100%" }}>
            <Brand />
            <div className="card stack" style={{ gap: 14 }}>
              {children}
            </div>
          </div>
        </main>
      </div>
    );
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
              <p className="brand-title" style={{ marginTop: 15 }}>Dari calon customer sampai pembayaran, dalam satu alur.</p>
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
