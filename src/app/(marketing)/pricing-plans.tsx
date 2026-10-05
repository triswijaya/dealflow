import { useState } from "react";
import { Icon } from "./landing-icon";
import type { CSSVars } from "./landing-hooks";

const FEATURES = [
  "Customer & pipeline deal",
  "Quotation, revisi & PDF",
  "Follow-up & composer WhatsApp",
  "Invoice & pencatatan pembayaran",
  "Role Owner, Admin, Sales & Finance",
];

const PLANS = [
  { name: "Starter", description: "Untuk pemilik bisnis dan tim penjualan kecil.", price: "Rp249.000", seats: 3, tag: null },
  { name: "Growth", description: "Untuk tim yang mulai membagi peran sales dan finance.", price: "Rp499.000", seats: 10, tag: "Kolaborasi lintas peran" },
  { name: "Scale", description: "Untuk lebih banyak anggota dalam satu perusahaan.", price: "Rp999.000", seats: 25, tag: null },
] as const;

const MAX_MEMBERS = PLANS[PLANS.length - 1].seats;

/** Plan cards plus a team-size slider that highlights the smallest plan that fits. Prices are still a proposal. */
export function PricingPlans() {
  const [members, setMembers] = useState(6);
  const recommended = PLANS.findIndex((plan) => members <= plan.seats);

  return (
    <>
      <div className="lp-team">
        <label htmlFor="team-size">Berapa orang di tim Anda?</label>
        <input
          id="team-size"
          className="lp-slider"
          type="range"
          min={1}
          max={MAX_MEMBERS}
          value={members}
          aria-valuetext={`${members} anggota`}
          style={{ "--fill": `${((members - 1) / (MAX_MEMBERS - 1)) * 100}%` } as CSSVars}
          onChange={(event) => setMembers(Number(event.target.value))}
        />
        <output htmlFor="team-size">{members} anggota</output>
      </div>
      <div className="lp-pricing-grid">
        {PLANS.map((plan, index) => {
          const isRecommended = index === recommended;
          return (
            <article className={isRecommended ? "lp-plan lp-rec lp-spot" : "lp-plan lp-spot"} key={plan.name}>
              <div className="lp-plan-top">
                <h3>{plan.name}</h3>
                {isRecommended ? <span className="lp-plan-tag">Pas untuk tim Anda</span> : plan.tag && <span className="lp-plan-tag lp-plain">{plan.tag}</span>}
              </div>
              <p className="lp-plan-desc">{plan.description}</p>
              <div className="lp-price">
                {plan.price}
                <small> / bulan</small>
              </div>
              <p className="lp-price-meta">Per perusahaan · hingga {plan.seats} anggota</p>
              <span className={isRecommended ? "lp-btn lp-primary lp-btn-soon" : "lp-btn lp-secondary lp-btn-soon"} aria-disabled="true">
                Segera tersedia
              </span>
              <ul className="lp-checklist">
                {FEATURES.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </>
  );
}
