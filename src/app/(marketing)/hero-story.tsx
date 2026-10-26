import { useEffect, useRef, useState } from "react";
import { Icon } from "./landing-icon";
import { formatRp, useCountTo, useInView, useReducedMotion } from "./landing-hooks";

const PAYMENT_AMOUNT = 10_000_000;
// How long each step (0..3) stays on screen; step 4 (payments) is timed by the payment ticks instead.
const STEP_MS = [2400, 2000, 2600, 2800];
const HOLD_AFTER_PAID_MS = 3400;

const STEPS = ["Customer", "Deal", "Quotation", "Menang", "Dibayar"] as const;
const STEP_ICONS = ["users", "brand", "fileText", "trophy", "wallet"] as const;

type Note = { id: string; icon: "users" | "brand" | "fileText" | "trophy" | "wallet"; title: string; body: string };

// One DealFlow notification per step of the story; payments add one each.
const STEP_NOTES: Note[] = [
  { id: "customer", icon: "users", title: "Customer baru", body: "PT Maju Jaya · Budi Santoso" },
  { id: "deal", icon: "brand", title: "Deal dibuat", body: "CCTV Installation - Bekasi · Rp30.000.000" },
  { id: "quote", icon: "fileText", title: "Quotation R1 terkirim", body: "QUO-2026-0018 · berlaku 14 hari" },
  { id: "won", icon: "trophy", title: "Deal Menang", body: "Finance bisa menerbitkan invoice" },
];

function notesFor(step: number, payments: number): Note[] {
  const notes = STEP_NOTES.slice(0, Math.min(step, 3) + 1);
  for (let n = 1; n <= payments; n++) notes.push({ id: `pay-${n}`, icon: "wallet", title: n === 3 ? "Invoice lunas" : "Pembayaran diterima", body: `Rp10.000.000 · ${n} dari 3` });
  // Newest first, three at most: older ones fade out below.
  return notes.slice(-3).reverse();
}

function paymentBadge(step: number, paid: number) {
  if (step < 3) return { tone: "wait", text: "Menunggu deal Menang" };
  if (paid === 0) return { tone: "info", text: "Belum dibayar" };
  if (paid < 3) return { tone: "warn", text: "Dibayar sebagian" };
  return { tone: "ok", text: "Lunas" };
}

/** The hero product frame: a WhatsApp thread, the DealFlow activity it triggers and the invoice it ends in. */
export function HeroStory() {
  const reduced = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [payments, setPayments] = useState(0);
  const [typing, setTyping] = useState(false);
  const [playing, setPlaying] = useState(true);
  const inView = useInView(frameRef, 0.25);

  // Under reduced motion the story is frozen on its final frame.
  const shownStep = reduced ? 4 : step;
  const shownPayments = reduced ? 3 : payments;
  const paidAmount = useCountTo(shownPayments * PAYMENT_AMOUNT);
  const badge = paymentBadge(shownStep, shownPayments);
  const notes = notesFor(shownStep, shownPayments);

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

  return (
    <div className="lp-ws" ref={frameRef} role="group" aria-label="Ilustrasi alur dari percakapan WhatsApp sampai invoice lunas. Data contoh.">
      <div className="lp-win">
        <div className="lp-win-bar">
          <span className="lp-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p className="lp-win-title" aria-hidden="true">
            <Icon name="brand" />
            CCTV Installation - Bekasi
            <span className="lp-pill-xs">Rp30 jt</span>
          </p>
          <button type="button" className="lp-st-play" aria-label={playing ? "Jeda demo" : "Putar demo"} aria-pressed={!playing} onClick={() => setPlaying((value) => !value)} hidden={reduced}>
            <Icon name={playing ? "pause" : "play"} />
          </button>
        </div>

        <div className="lp-win-body">
          <div className="lp-win-side">
            <p className="lp-win-label">Alur deal</p>
            <ol className="lp-steps">
              {STEPS.map((label, i) => (
                <li key={label}>
                  <button
                    type="button"
                    className={i < shownStep ? "lp-step lp-done" : i === shownStep ? "lp-step lp-current" : "lp-step"}
                    aria-current={i === shownStep ? "step" : undefined}
                    onClick={() => goTo(i)}
                  >
                    <Icon name={STEP_ICONS[i]} />
                    <span>{label}</span>
                    <i className="lp-step-mark" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="lp-win-deals" aria-hidden="true">
              <p className="lp-win-label">Deal lain</p>
              <ul>
                <li>Hotel Mega Kencana<i /></li>
                <li>PT Bumi Karya<i /></li>
                <li>Klinik Sehat Sentosa</li>
              </ul>
            </div>
          </div>

          <div className="lp-win-main" aria-hidden="true">
            <div className="lp-chat-head">
              <span className="lp-st-avatar">BS</span>
              <div>
                <strong>Budi · PT Maju Jaya</strong>
                <small>{typing ? "sedang mengetik..." : "WhatsApp · online"}</small>
              </div>
            </div>
            <div className="lp-chat">
              <div className="lp-st-bubble lp-st-in">
                Pak, butuh CCTV 16 titik untuk gudang Bekasi. Bisa minta penawaran?
                <small>09.12</small>
              </div>
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
            <ol className="lp-ws-notes">
              {notes.map((note, index) => (
                <li key={note.id} className="lp-note" style={{ opacity: 1 - index * 0.28 }}>
                  <Icon name={note.icon} />
                  <span>
                    <b>{note.title}</b> {note.body}
                  </span>
                  <Icon name="chevron" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <aside className={shownStep >= 3 ? "lp-ws-invoice lp-show" : "lp-ws-invoice"} aria-hidden="true">
        <p className="lp-ws-inv-meta">
          <Icon name="receipt" />
          <b>Invoice</b>
          <span>· INV-2026-0042</span>
        </p>
        <div className="lp-ws-inv-amount">{formatRp(paidAmount)}</div>
        <div className="lp-ws-inv-row">
          <span className="lp-st-avatar">BS</span>
          <span>Budi Santoso</span>
          <span className="lp-pill-xs">PT Maju Jaya</span>
          <span key={badge.text} className={`lp-bd lp-bd-${badge.tone} lp-st-bump`}>{badge.text}</span>
        </div>
        <div className="lp-ws-inv-panel">
          <p>
            <b>Pembayaran</b>
            <span>{shownPayments}/3</span>
          </p>
          <div className="lp-st-bar"><i style={{ transform: `scaleX(${shownPayments / 3})` }} /></div>
          <small>Total Rp30.000.000 · dicatat per transfer</small>
        </div>
      </aside>
    </div>
  );
}
