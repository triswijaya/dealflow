import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./landing-icon";
import { useInView, useReducedMotion, type CSSVars } from "./landing-hooks";

const SCRAPS = [
  { icon: "message", source: "WhatsApp · 3 hari lalu", text: "“Pak, quotation yang revisi kemarin mana ya?”", left: "5%", top: "22%", rot: -3, note: false },
  { icon: "fileText", source: "Penawaran_FINAL_v3(2).pdf", text: "Yang mana versi terbaru?", left: "32%", top: "50%", rot: 4, note: false },
  { icon: "sheet", source: "Sheet “Pipeline 2026”", text: "Baris 48: status “follow up??”", left: "6%", top: "68%", rot: 2, note: false },
  { icon: "receipt", source: "Catatan finance", text: "PT Bumi Karya sudah DP belum?", left: "58%", top: "18%", rot: -5, note: true },
  { icon: "message", source: "Grup “Sales Team”", text: "“Siapa yang pegang Klinik Sentosa?”", left: "66%", top: "58%", rot: 3, note: false },
  { icon: "calendar", source: "Sticky note", text: "Follow up Sentra Niaga... kapan?", left: "40%", top: "80%", rot: -2, note: true },
] as const;

const ORGANISED = [
  { name: "PT Sentra Niaga", meta: "Follow-up besok 09.00 · Rina", tone: "info", status: "Quotation terkirim" },
  { name: "PT Bumi Karya", meta: "Rp48.500.000 · Negosiasi", tone: "ok", status: "Revisi R2" },
  { name: "Klinik Sehat Sentosa", meta: "Sisa tagihan Rp20.000.000", tone: "warn", status: "Dibayar sebagian" },
  { name: "PT Maju Jaya", meta: "INV-2026-0042", tone: "lime", status: "Lunas" },
  { name: "CV Arta Graha", meta: "Sales: Dimas · Baru", tone: "wait", status: "Perlu dihubungi" },
  { name: "Hotel Mega Kencana", meta: "Jatuh tempo 5 Okt", tone: "bad", status: "Lewat jatuh tempo" },
] as const;

/** Before/after slider: scattered notes on the left, the same deals organised in DealFlow on the right. */
export function CompareSlider() {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const inView = useInView(frameRef, 0.6);
  const reduced = useReducedMotion();
  const touched = useRef(false);
  const hinted = useRef(false);

  // Nudge the handle once when it first scrolls into view, so visitors see that it moves.
  useEffect(() => {
    if (!inView || reduced || hinted.current) return;
    const keys = [50, 76, 28, 50];
    const segment = 700;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (touched.current) return;
      if (!t0) {
        t0 = now;
        hinted.current = true;
      }
      const progress = (now - t0) / segment;
      const index = Math.floor(progress);
      if (index >= keys.length - 1) {
        setPosition(50);
        return;
      }
      const k = progress - index;
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setPosition(keys[index] + (keys[index + 1] - keys[index]) * eased);
      raf = requestAnimationFrame(tick);
    };
    const id = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 400);
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
    };
  }, [inView, reduced]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const delta = { ArrowLeft: -5, ArrowRight: 5 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    touched.current = true;
    setPosition((value) => Math.min(100, Math.max(0, Math.round(value) + delta)));
  }

  return (
    <>
      <div className="lp-compare" ref={frameRef} style={{ "--pos": position } as CSSVars}>
        <div className="lp-cmp-layer lp-cmp-before">
          <span className="lp-cmp-tag">Sebelum</span>
          {SCRAPS.map((scrap, i) => (
            <div
              key={scrap.source}
              className={scrap.note ? "lp-scrap lp-scrap-note" : "lp-scrap"}
              style={{ left: scrap.left, top: scrap.top, "--rot": `${scrap.rot}deg`, "--i": i } as CSSVars}
            >
              <small>
                <Icon name={scrap.icon} />
                {scrap.source}
              </small>
              {scrap.text}
            </div>
          ))}
        </div>
        <div className="lp-cmp-layer lp-cmp-after">
          <span className="lp-cmp-tag">Dengan DealFlow</span>
          <div className="lp-cmp-grid">
            {ORGANISED.map((deal) => (
              <div className="lp-cmp-deal" key={deal.name}>
                <div>
                  {deal.name}
                  <small>{deal.meta}</small>
                </div>
                <span className={`lp-bd lp-bd-${deal.tone}`}>{deal.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-cmp-handle" aria-hidden="true">
          <span>
            <Icon name="swap" />
          </span>
        </div>
        <input
          className="lp-cmp-range"
          type="range"
          min={0}
          max={100}
          value={Math.round(position)}
          aria-label="Geser untuk membandingkan sebelum dan sesudah memakai DealFlow"
          onChange={(event) => {
            touched.current = true;
            setPosition(Number(event.target.value));
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className="lp-try lp-try-center">
        <Icon name="pointer" />
        Geser untuk merapikan · ilustrasi dengan data contoh
      </p>
    </>
  );
}
