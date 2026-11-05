import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatRp, useCountTo, useReducedMotion, type CSSVars } from "./landing-hooks";

// The last three active stages of the app pipeline (src/lib/labels.ts).
const STAGES = ["Penawaran dikirim", "Negosiasi", "Menunggu komitmen"] as const;

const OTHER_DEALS = [
  { id: "hotel", name: "Hotel Mega", value: "Rp22 jt", column: 0 },
  { id: "bumi", name: "Bumi Karya", value: "Rp48,5 jt", column: 1 },
  { id: "arta", name: "CV Arta", value: "Rp12 jt", column: 1 },
  { id: "maju", name: "Maju Jaya", value: "Rp30 jt", column: 2 },
] as const;

/** Mini pipeline: the highlighted deal moves to the next column each time it is clicked. */
export function KanbanDemo() {
  const reduced = useReducedMotion();
  const [column, setColumn] = useState(0);
  const cards = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, DOMRect>());

  function advance() {
    cards.current.forEach((el, id) => before.current.set(id, el.getBoundingClientRect()));
    setColumn((value) => (value + 1) % STAGES.length);
  }

  // FLIP: animate every card from where it was to where it landed after the move.
  useLayoutEffect(() => {
    if (!reduced) {
      cards.current.forEach((el, id) => {
        const from = before.current.get(id);
        if (!from) return;
        const to = el.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }
    before.current.clear();
  }, [column, reduced]);

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  };

  return (
    <div className="lp-kanban">
      {STAGES.map((stage, index) => {
        const here = OTHER_DEALS.filter((deal) => deal.column === index);
        const count = here.length + (column === index ? 1 : 0);
        return (
          <div className={column === index && index === 2 ? "lp-kcol lp-lit" : "lp-kcol"} key={stage}>
            <h4>
              {stage}
              <span>{count}</span>
            </h4>
            <div className="lp-kcol-body">
              {column === index && (
                <button type="button" className="lp-kcard lp-kcard-hot" ref={register("sentra")} onClick={advance} aria-label={`Sentra Niaga di tahap ${stage}. Klik untuk memajukan tahapnya.`}>
                  <b>Sentra Niaga</b>Rp18 jt
                </button>
              )}
              {here.map((deal) => (
                <div className="lp-kcard" key={deal.id} ref={register(deal.id)}>
                  <b>{deal.name}</b>
                  {deal.value}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const VERSIONS = [
  {
    no: "R0",
    badge: { tone: "wait", text: "Versi lama" },
    rows: [
      ["CCTV 4MP × 4", 6_000_000],
      ["Instalasi", 6_000_000],
      ["Kabel UTP 120 m", 1_500_000],
    ],
  },
  {
    no: "R1",
    badge: { tone: "info", text: "Terkirim" },
    rows: [
      ["CCTV 4MP × 6", 9_000_000],
      ["Instalasi", 6_000_000],
      ["Kabel UTP 180 m", 2_250_000],
    ],
  },
  {
    no: "R2",
    badge: { tone: "wait", text: "Draft" },
    rows: [
      ["CCTV 4MP × 6", 9_000_000],
      ["Instalasi", 5_000_000],
      ["Kabel UTP 180 m", 2_250_000],
    ],
  },
] as const;

/** Quotation revisions: switch between R0, R1 and R2 and see which lines changed. */
export function QuotationDemo() {
  const [version, setVersion] = useState(1);
  const [previous, setPrevious] = useState<number | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);
  const current = VERSIONS[version];
  const total = useCountTo(current.rows.reduce((sum, row) => sum + row[1], 0));

  useEffect(() => {
    if (!whatsapp) return;
    const id = window.setTimeout(() => setWhatsapp(false), 3200);
    return () => window.clearTimeout(id);
  }, [whatsapp]);

  function select(index: number) {
    if (index === version) return;
    setPrevious(version);
    setVersion(index);
  }

  return (
    <div className="lp-qdemo">
      <div className="lp-qtabs" role="group" aria-label="Versi quotation">
        {VERSIONS.map((item, index) => (
          <button type="button" key={item.no} aria-pressed={index === version} onClick={() => select(index)}>
            {item.no}
          </button>
        ))}
      </div>
      <div className="lp-qdoc">
        <div className="lp-qdoc-head">
          <b>QUO-0018 · {current.no}</b>
          <span key={current.no} className={`lp-bd lp-bd-${current.badge.tone} lp-st-bump`}>
            {current.badge.text}
          </span>
        </div>
        {current.rows.map((row, i) => {
          const changed = previous !== null && (VERSIONS[previous].rows[i][0] !== row[0] || VERSIONS[previous].rows[i][1] !== row[1]);
          return (
            <div className={changed ? "lp-qrow lp-changed" : "lp-qrow"} key={`${current.no}-${i}`}>
              <span>{row[0]}</span>
              <span>{formatRp(row[1])}</span>
            </div>
          );
        })}
        <div className="lp-qtot">
          <span>Total</span>
          <span>{formatRp(total)}</span>
        </div>
      </div>
      <button type="button" className="lp-wa-btn" onClick={() => setWhatsapp(true)}>
        Buka WhatsApp
      </button>
      <p className="lp-wa-note" role="status">
        {whatsapp ? "Pesan disiapkan. Anda yang menekan kirim." : ""}
      </p>
    </div>
  );
}

const INVOICE_TOTAL = 30_000_000;
const INVOICE_STATUS = [
  { tone: "info", text: "Belum dibayar" },
  { tone: "warn", text: "Dibayar sebagian" },
  { tone: "warn", text: "Dibayar sebagian" },
  { tone: "ok", text: "Lunas" },
] as const;

/** Invoice balance: record Rp10 jt payments until the invoice is paid, then start over. */
export function InvoiceDemo() {
  const [payments, setPayments] = useState(0);
  const paid = useCountTo(payments * 10_000_000);
  const percent = useCountTo((payments / 3) * 100);
  const status = INVOICE_STATUS[payments];
  const done = payments === 3;

  return (
    <div className="lp-idemo">
      <div className="lp-inv">
        <div className="lp-donut" style={{ "--p": (payments / 3) * 100 } as CSSVars} role="img" aria-label={`${Math.round((payments / 3) * 100)} persen terbayar`}>
          <span>{Math.round(percent)}%</span>
        </div>
        <dl className="lp-inv-list">
          <div>
            <dt>Total invoice</dt>
            <dd>Rp30.000.000</dd>
          </div>
          <div>
            <dt>Terbayar</dt>
            <dd>{formatRp(paid)}</dd>
          </div>
          <div>
            <dt>Sisa</dt>
            <dd>{formatRp(INVOICE_TOTAL - paid)}</dd>
          </div>
        </dl>
      </div>
      <div className="lp-inv-actions">
        <span key={status.text} className={`lp-bd lp-bd-${status.tone} lp-st-bump`} role="status">
          {status.text}
        </span>
        <button type="button" className="lp-btn lp-primary lp-btn-sm" onClick={() => setPayments((value) => (value >= 3 ? 0 : value + 1))}>
          {done ? "Ulangi demo" : "Catat Rp10 jt"}
        </button>
      </div>
    </div>
  );
}
