import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "./landing-icon";
import { formatRp, LANDING_ZOOM, useCountTo, useInView, useReducedMotion, type CSSVars } from "./landing-hooks";

const STAGE_HEIGHT = 640;
const PAYMENT_AMOUNT = 10_000_000;
// How long each step (0..3) stays on screen; step 4 (payments) is timed by the payment ticks instead.
const STEP_MS = [2400, 2000, 2600, 2800];
const HOLD_AFTER_PAID_MS = 3400;

const TIMELINE = [
  { label: "Customer", date: "12 Sep", icon: "users" },
  { label: "Deal", date: "13 Sep", icon: "brand" },
  { label: "Quotation", date: "26 Sep", icon: "fileText" },
  { label: "Menang", date: "28 Sep", icon: "trophy" },
  { label: "Dibayar", date: "30 Sep", icon: "wallet" },
] as const;

const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const distance = 70 + (i % 3) * 28;
  return { tx: Math.round(Math.cos(angle) * distance), ty: Math.round(Math.sin(angle) * distance) - 30, rot: (i * 67) % 540, tone: i % 4 };
});

function paymentBadge(step: number, paid: number) {
  if (step < 3) return { tone: "wait", text: "Menunggu deal Menang" };
  if (paid === 0) return { tone: "info", text: "Belum dibayar" };
  if (paid < 3) return { tone: "warn", text: "Dibayar sebagian" };
  return { tone: "ok", text: "Lunas" };
}

/** Looping product story: chat -> deal -> quotation -> won -> three payments -> paid. All sample data. */
export function HeroStory() {
  const reduced = useReducedMotion();
  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [payments, setPayments] = useState(0);
  const [typing, setTyping] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [confetti, setConfetti] = useState(false);
  const inView = useInView(stageRef, 0.25);

  // Under reduced motion the story is frozen on its final frame.
  const shownStep = reduced ? 4 : step;
  const shownPayments = reduced ? 3 : payments;
  const paidAmount = useCountTo(shownPayments * PAYMENT_AMOUNT);
  const badge = paymentBadge(shownStep, shownPayments);

  // Scale the whole composition down on short desktop viewports so the hero fits one screen.
  useEffect(() => {
    const fit = () => {
      const fitEl = fitRef.current;
      const stage = stageRef.current;
      if (!fitEl || !stage) return;
      const scale = window.innerWidth > 1020 ? Math.max(0.7, Math.min(1, (window.innerHeight / LANDING_ZOOM - 87 - 48) / STAGE_HEIGHT)) : 1;
      stage.style.transform = scale < 1 ? `scale(${scale})` : "";
      fitEl.style.height = scale < 1 ? `${STAGE_HEIGHT * scale}px` : "";
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Payment ticks: three payments arrive one after another once the story reaches step 4.
  useEffect(() => {
    if (reduced || step !== 4 || payments >= 3) return;
    const id = window.setTimeout(
      () => {
        const next = payments + 1;
        setPayments(next);
        if (next === 3) setConfetti(true);
      },
      payments === 0 ? 500 : 750,
    );
    return () => window.clearTimeout(id);
  }, [reduced, step, payments]);

  useEffect(() => {
    if (!confetti) return;
    const id = window.setTimeout(() => setConfetti(false), 1000);
    return () => window.clearTimeout(id);
  }, [confetti]);

  // Advance to the next step, showing the typing dots shortly before the customer replies.
  useEffect(() => {
    if (reduced || !playing || !inView) return;
    if (step === 4 && payments < 3) return;
    const last = step === 4;
    const next = last ? 0 : step + 1;
    const duration = last ? HOLD_AFTER_PAID_MS : STEP_MS[step];
    const ids: number[] = [];
    if (next === 0 || next === 3) ids.push(window.setTimeout(() => setTyping(true), Math.max(0, duration - 900)));
    ids.push(
      window.setTimeout(() => {
        setTyping(false);
        setStep(next);
        if (last) {
          setPayments(0);
          setConfetti(false);
        }
      }, duration),
    );
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
      setTyping(false);
    };
  }, [reduced, playing, inView, step, payments]);

  function goTo(index: number) {
    setTyping(false);
    setConfetti(false);
    setStep(index);
    setPayments(index === 4 ? 3 : 0);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    stage.style.setProperty("--mx", String(((event.clientX - rect.left) / rect.width - 0.5) * 2));
    stage.style.setProperty("--my", String(((event.clientY - rect.top) / rect.height - 0.5) * 2));
  }

  function onPointerLeave() {
    stageRef.current?.style.setProperty("--mx", "0");
    stageRef.current?.style.setProperty("--my", "0");
  }

  return (
    <div className="lp-st-fit" ref={fitRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="lp-stage" ref={stageRef} role="group" aria-label="Ilustrasi alur dari percakapan WhatsApp sampai invoice lunas. Data contoh.">
        <div className="lp-st-glow" aria-hidden="true" />

        <div className="lp-st-card lp-st-chat" aria-hidden="true">
          <div className="lp-st-chat-head">
            <span className="lp-st-avatar">BS</span>
            <div>
              <strong>Budi · PT Maju Jaya</strong>
              <small>WhatsApp</small>
            </div>
            <span className="lp-st-online">online</span>
          </div>
          <div className="lp-st-chat-body">
            {shownStep >= 0 && (
              <div className="lp-st-bubble lp-st-in">
                Pak, butuh CCTV 16 titik untuk gudang Bekasi. Bisa minta penawaran?
                <small>09.12</small>
              </div>
            )}
            {shownStep >= 1 && <div className="lp-st-sys">Deal dibuat · Rp30.000.000</div>}
            {shownStep >= 2 && (
              <div className="lp-st-bubble lp-st-out">
                <span className="lp-st-attach">
                  <Icon name="fileText" />
                  QUO-2026-0018 · R1.pdf
                </span>
                Terlampir revisi penawarannya ya Pak.
                <small>14.03 ✓✓</small>
              </div>
            )}
            {shownStep >= 3 && (
              <>
                <div className="lp-st-bubble lp-st-in">
                  Sudah oke. Kami lanjut, tolong kirim invoice.
                  <small>10.24</small>
                </div>
                <div className="lp-st-sys lp-st-sys-won">Deal Menang</div>
              </>
            )}
            {shownStep >= 4 && shownPayments === 3 && <div className="lp-st-sys">Pembayaran ke-3 dicatat · Lunas</div>}
            {typing && (
              <div className="lp-st-typing">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
        </div>

        <div className={shownStep < 3 ? "lp-st-card lp-st-pay lp-st-waiting" : "lp-st-card lp-st-pay"} aria-hidden="true">
          <div className="lp-st-pay-top">
            <small>INV-2026-0042</small>
            <span key={badge.text} className={`lp-bd lp-bd-${badge.tone} lp-st-bump`}>
              {badge.text}
            </span>
          </div>
          <small>Terbayar · PT Maju Jaya</small>
          <div className="lp-st-amount">{formatRp(paidAmount)}</div>
          <div className="lp-st-bar">
            <i style={{ transform: `scaleX(${shownPayments / 3})` }} />
          </div>
          <div className="lp-st-pay-rows">
            <span>{shownStep < 3 ? "Invoice belum dibuat" : `${shownPayments} dari 3 pembayaran`}</span>
            <span>dari Rp30.000.000</span>
          </div>
          {confetti && (
            <span className="lp-st-confetti" aria-hidden="true">
              {CONFETTI.map((piece, i) => (
                <i key={i} className={`lp-st-tone-${piece.tone}`} style={{ "--tx": `${piece.tx}px`, "--ty": `${piece.ty}px`, "--rot": `${piece.rot}deg` } as CSSVars} />
              ))}
            </span>
          )}
        </div>

        <div className="lp-st-card lp-st-timeline">
          <div className="lp-st-tl-head">
            <span>Perjalanan deal · data contoh</span>
            <button
              type="button"
              className="lp-st-play"
              aria-label={playing ? "Jeda demo" : "Putar demo"}
              aria-pressed={!playing}
              onClick={() => setPlaying((value) => !value)}
              hidden={reduced}
            >
              <Icon name={playing ? "pause" : "play"} />
            </button>
          </div>
          <ol className="lp-st-steps">
            <li className="lp-st-line" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.max(0, shownStep) / 4})` }} />
            </li>
            {TIMELINE.map((item, i) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={i < shownStep ? "lp-st-step lp-st-done" : i === shownStep ? "lp-st-step lp-st-current" : "lp-st-step"}
                  aria-current={i === shownStep ? "step" : undefined}
                  onClick={() => goTo(i)}
                >
                  <span className="lp-st-dot">
                    <Icon name={item.icon} />
                  </span>
                  <b>{item.label}</b>
                  {item.date}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
