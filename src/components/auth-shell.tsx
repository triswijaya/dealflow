import type { CSSProperties, ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/lib/labels";

// A static, fictional glimpse of the product beside the form.
const PREVIEW_KPIS = [
  { label: "Nilai pipeline", value: "Rp726 jt", note: "15 peluang aktif" },
  { label: "Menang bulan ini", value: "Rp81 jt", note: "4 deal" },
  { label: "Belum lunas", value: "Rp90 jt", note: "4 invoice" },
];
const PREVIEW_DEALS: { title: string; customer: string; stage: string; tone: BadgeTone }[] = [
  { title: "Smart building cabling", customer: "PT Karya Teknik Utama", stage: "Negosiasi", tone: "warning" },
  { title: "Fiber optic backbone kampus", customer: "Yayasan Pendidikan Cahaya", stage: "Terkualifikasi", tone: "info" },
  { title: "Kamera pengawas ruko", customer: "PT Jaringan Andalan Prima", stage: "Menang", tone: "success" },
];

/**
 * The frame around every signed-out screen. "split" puts the form beside a
 * quiet product panel (login, register, forgot and reset password, accepting
 * an invitation); "state" is a single centred card for a short status message
 * (verifying, expired link, preparing the workspace).
 */
export function AuthShell({ children, variant = "split" }: { children: ReactNode; variant?: "split" | "state" }) {
  if (variant === "state") {
    return (
      <div className="df auth-root-state">
        <main className="auth-page">
          <div className="auth-state stack" style={{ gap: 24 }}>
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
    <div className="df">
      <main className="auth-page">
        <div className="auth-stage">
          <section className="auth-main">
            <Brand />
            <div className="auth-form">{children}</div>
            <p className="auth-foot">DealFlow · Ruang kerja yang rapi, percakapan yang berarti.</p>
          </section>
          <aside className="brand-panel">
            <div>
              <div className="eyebrow">Sales-to-cash untuk bisnis B2B</div>
              <p className="brand-title" style={{ marginTop: 8 }}>
                Dari calon customer sampai pembayaran, dalam satu alur.
              </p>
              <p>Pipeline, penawaran, follow-up, dan invoice tim Anda di satu ruang kerja.</p>
            </div>
            <div className="auth-preview" aria-hidden="true">
              <div className="kpis" style={{ "--n": PREVIEW_KPIS.length } as CSSProperties}>
                {PREVIEW_KPIS.map((kpi) => (
                  <div key={kpi.label} className="kpi">
                    <label>{kpi.label}</label>
                    <strong>{kpi.value}</strong>
                    <small>{kpi.note}</small>
                  </div>
                ))}
              </div>
              <div>
                {PREVIEW_DEALS.map((deal) => (
                  <div key={deal.title} className="preview-row">
                    <div>
                      <strong>{deal.title}</strong>
                      <small>{deal.customer}</small>
                    </div>
                    <Badge tone={deal.tone}>{deal.stage}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
