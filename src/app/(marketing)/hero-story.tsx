import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "./landing-icon";
import { formatRp, LANDING_ZOOM, useCountTo, useInView, useReducedMotion } from "./landing-hooks";

const STAGE_HEIGHT = 640;
const PAYMENT_AMOUNT = 10_000_000;
// How long each step (0..3) stays on screen; step 4 (payments) is timed by the payment ticks instead.
const STEP_MS = [2400, 2000, 2600, 2800];
const HOLD_AFTER_PAID_MS = 3400;

const STEPS = ["Customer", "Deal", "Quotation", "Menang", "Dibayar"] as const;

type Note = { id: string; icon: "users" | "brand" | "fileText" | "trophy" | "wallet"; title: string; body: string };

// One DealFlow notification per step of the story; payments add one each.
const STEP_NOTES: Note[] = [
  { id: "customer", icon: "users", title: "Customer baru", body: "PT Maju Jaya \u00b7 Budi Santoso" },
  { id: "deal", icon: "brand", title: "Deal dibuat", body: "CCTV Installation - Bekasi \u00b7 Rp30.000.000" },
  { id: "quote", icon: "fileText", title: "Quotation R1 terkirim", body: "QUO-2026-0018 \u00b7 berlaku 14 hari" },
  { id: "won", icon: "trophy", title: "Deal Menang", body: "Finance bisa menerbitkan invoice" },
];

function notesFor(step: number, payments: number): Note[] {
  const notes = STEP_NOTES.slice(0, Math.min(step, 3) + 1);
  for (let n = 1; n <= payments; n++) notes.push({ id: `pay-${n}`, icon: "wallet", title: n === 3 ? "Invoice lunas" : "Pembayaran diterima", body: `Rp10.000.000 \u00b7 ${n} dari 3` });
  // Newest first, three at most: older ones slide down and fade behind.
  return notes.slice(-3).reverse();
}

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
  const inView = useInView(stageRef, 0.25);

  // Under reduced motion the story is frozen on its final frame.
  const shownStep = reduced ? 4 : step;
  const shownPayments = reduced ? 3 : payments;
  const paidAmount = useCountTo(shownPayments * PAYMENT_AMOUNT);
  const badge = paymentBadge(shownStep, shownPayments);
  const notes = notesFor(shownStep, shownPayments);

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
        setPayments(payments + 1);
      },
      payments === 0 ? 500 : 750,
    );
    return () => window.clearTimeout(id);
  }, [reduced, step, payments]);

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
        if (last) setPayments(0);
      }, duration),
    );
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
      setTyping(false);
    };
  }, [reduced, playing, inView, step, payments]);

  function goTo(index: number) {
    setTyping(false);
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
      <div className="lp-stage lp-ph-stage" ref={stageRef} role="group" aria-label="Ilustrasi alur dari percakapan WhatsApp sampai invoice lunas. Data contoh.">
        <div className="lp-ph-halo" aria-hidden="true" />

        <div className="lp-ph" aria-hidden="true">
          <div className="lp-ph-screen">
            <div className="lp-ph-status"><span>09.41</span><i className="lp-ph-island" /><span>5G</span></div>
            <div className="lp-ph-head">
              <span className="lp-st-avatar">BS</span>
              <div>
                <strong>Budi · PT Maju Jaya</strong>
                <small>{typing ? "sedang mengetik..." : "online"}</small>
              </div>
            </div>
            <div className="lp-ph-chat">
              {shownStep >= 0 && (
                <div className="lp-st-bubble lp-st-in">
                  Pak, butuh CCTV 16 titik untuk gudang Bekasi. Bisa minta penawaran?
                  <small>09.12</small>
                </div>
              )}
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
                <div className="lp-st-bubble lp-st-in">
                  Sudah oke. Kami lanjut, tolong kirim invoice.
                  <small>10.24</small>
                </div>
              )}
              {shownStep >= 4 && shownPayments >= 1 && (
                <div className="lp-st-bubble lp-st-in">
                  Sudah kami transfer DP ya Pak.
                  <small>09.05</small>
                </div>
              )}
              {typing && (
                <div className="lp-st-typing">
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
            <div className="lp-ph-input"><span>Ketik pesan</span><i /></div>
          </div>
        </div>

        <ol className="lp-ph-notes" aria-hidden="true">
          {notes.map((note, index) => (
            <li key={note.id} className="lp-ph-note" style={{ transform: `translateY(${index * 78}px) scale(${1 - index * 0.06})`, opacity: 1 - index * 0.28, zIndex: 3 - index }}>
              <div className="lp-ph-note-in">
                <span className={note.icon === "wallet" || note.icon === "trophy" ? "lp-ph-note-icon lp-hot" : "lp-ph-note-icon"}>
                  <Icon name={note.icon} />
                </span>
                <div>
                  <b>{note.title}</b>
                  <small>{note.body}</small>
                </div>
                <em>DealFlow · baru saja</em>
              </div>
            </li>
          ))}
        </ol>

        <div className={shownStep >= 3 ? "lp-ph-invoice lp-show" : "lp-ph-invoice"} aria-hidden="true">
          <div className="lp-ph-inv-top">
            <small>INV-2026-0042</small>
            <span key={badge.text} className={`lp-bd lp-bd-${badge.tone} lp-st-bump`}>{badge.text}</span>
          </div>
          <div className="lp-ph-inv-amount">{formatRp(paidAmount)}</div>
          <div className="lp-st-bar"><i style={{ transform: `scaleX(${shownPayments / 3})` }} /></div>
          <small>{shownPayments} dari 3 pembayaran · Rp30.000.000</small>
        </div>

        <div className="lp-ph-steps">
          <ol>
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  className={i < shownStep ? "lp-ph-step lp-done" : i === shownStep ? "lp-ph-step lp-current" : "lp-ph-step"}
                  aria-current={i === shownStep ? "step" : undefined}
                  onClick={() => goTo(i)}
                >
                  <i />
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="lp-st-play" aria-label={playing ? "Jeda demo" : "Putar demo"} aria-pressed={!playing} onClick={() => setPlaying((value) => !value)} hidden={reduced}>
            <Icon name={playing ? "pause" : "play"} />
          </button>
        </div>
      </div>
    </div>
  );
}
