import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./landing-icon";
import { useInView } from "./landing-hooks";

type FlowStep = { title: string; description: string; panel: ReactNode };

const STEPS: FlowStep[] = [
  {
    title: "Customer",
    description: "Simpan perusahaan, kontak, dan konteks percakapan.",
    panel: (
      <>
        <div className="lp-fp-top">
          <span>Customer</span>
          <span className="lp-bd lp-bd-ok">Aktif</span>
        </div>
        <div className="lp-fp-head">
          <span className="lp-st-avatar">MJ</span>
          <div>
            <b>PT Maju Jaya</b>
            <small>Customer sejak 12 Sep 2026</small>
          </div>
        </div>
        <dl className="lp-fp-dl">
          <div><dt>Kontak</dt><dd>Budi Santoso · Purchasing</dd></div>
          <div><dt>WhatsApp</dt><dd>0812-xxxx-2210</dd></div>
          <div><dt>Lokasi</dt><dd>Bekasi, Jawa Barat</dd></div>
          <div><dt>Catatan</dt><dd>Gudang baru, butuh 16 titik CCTV.</dd></div>
          <div><dt>Deal</dt><dd>1 aktif · 0 selesai</dd></div>
        </dl>
      </>
    ),
  },
  {
    title: "Deal",
    description: "Catat kebutuhan, nilai peluang, dan sales yang menangani.",
    panel: (
      <>
        <div className="lp-fp-top">
          <span>Deal · PT Maju Jaya</span>
          <span>DEAL-0031</span>
        </div>
        <b className="lp-fp-title">CCTV Installation - Bekasi</b>
        <div className="lp-fp-big">Rp30.000.000</div>
        <div className="lp-fp-stages">
          <span className="lp-done">Baru</span>
          <span className="lp-done">Dihubungi</span>
          <span className="lp-cur">Terkualifikasi</span>
          <span>Quotation</span>
          <span>Negosiasi</span>
        </div>
        <dl className="lp-fp-dl">
          <div><dt>Sales</dt><dd>Rina Oktaviani</dd></div>
          <div><dt>Kebutuhan</dt><dd>16 kamera 4MP, NVR, instalasi</dd></div>
          <div><dt>Target</dt><dd>Selesai akhir Oktober</dd></div>
        </dl>
      </>
    ),
  },
  {
    title: "Penawaran",
    description: "Buat quotation dan PDF setelah kebutuhan makin jelas.",
    panel: (
      <>
        <div className="lp-fp-top">
          <span>QUO-2026-0018 · R1</span>
          <span className="lp-bd lp-bd-info">Terkirim</span>
        </div>
        <dl className="lp-fp-dl lp-fp-money">
          <div><dt>CCTV Camera 4MP × 16</dt><dd>Rp19.200.000</dd></div>
          <div><dt>NVR 16 channel × 1</dt><dd>Rp4.300.000</dd></div>
          <div><dt>Instalasi & konfigurasi</dt><dd>Rp6.500.000</dd></div>
          <div className="lp-fp-sum"><dt>Total</dt><dd>Rp30.000.000</dd></div>
        </dl>
        <div className="lp-fp-chips">
          <span><Icon name="fileText" />Unduh PDF</span>
          <span>Lihat R0</span>
        </div>
      </>
    ),
  },
  {
    title: "Follow-up",
    description: "Jadwalkan interaksi sampai deal Menang atau Kalah.",
    panel: (
      <>
        <div className="lp-fp-top">
          <span>Follow-up · CCTV Installation - Bekasi</span>
          <span>3 jadwal</span>
        </div>
        <ul className="lp-fp-fu">
          <li>
            <Icon name="phone" />
            <span>Konfirmasi spesifikasi<small>Selesai · 22 Sep</small></span>
          </li>
          <li>
            <Icon name="fileText" />
            <span>Kirim revisi R1<small>Selesai · 26 Sep</small></span>
          </li>
          <li className="lp-next">
            <Icon name="message" />
            <span>Tanya keputusan<small>Besok · 09.00 WIB</small></span>
            <span className="lp-fp-wa">Buka WhatsApp</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Pembayaran",
    description: "Terbitkan invoice dari deal Menang dan catat uang masuk.",
    panel: (
      <>
        <div className="lp-fp-top">
          <span>INV-2026-0042</span>
          <span className="lp-bd lp-bd-lime">Lunas</span>
        </div>
        <div className="lp-fp-big">Rp30.000.000</div>
        <small className="lp-fp-sub">Dari deal Menang · CCTV Installation - Bekasi</small>
        <dl className="lp-fp-dl lp-fp-money">
          <div><dt>DP · 28 Sep</dt><dd>Rp10.000.000</dd></div>
          <div><dt>Termin 2 · 29 Sep</dt><dd>Rp10.000.000</dd></div>
          <div><dt>Pelunasan · 30 Sep</dt><dd>Rp10.000.000</dd></div>
          <div><dt>Sisa tagihan</dt><dd>Rp0</dd></div>
        </dl>
      </>
    ),
  },
];

/** Five-step walkthrough. Steps advance on their own (paused on hover, focus or when off screen) and can be picked by hand. */
export function FlowStepper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inView = useInView(rootRef, 0.4);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const paused = held || !inView;

  function select(index: number, focus = false) {
    const next = (index + STEPS.length) % STEPS.length;
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: STEPS.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target, true);
  }

  return (
    <div
      className={paused ? "lp-flow-ui lp-held" : "lp-flow-ui"}
      ref={rootRef}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="lp-fs-list" role="tablist" aria-label="Langkah alur DealFlow" aria-orientation="vertical">
        {STEPS.map((step, index) => (
          <button
            key={step.title}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`flow-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`flow-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            className="lp-fs-tab"
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="lp-fs-num">0{index + 1}</span>
            <span className="lp-fs-title">{step.title}</span>
            <span className="lp-fs-desc">{step.description}</span>
            {active === index && (
              <span className="lp-fs-prog" aria-hidden="true">
                <i onAnimationEnd={() => select(index + 1)} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="lp-fs-stage">
        {STEPS.map((step, index) => (
          <div key={step.title} role="tabpanel" id={`flow-panel-${index}`} aria-labelledby={`flow-tab-${index}`} className={active === index ? "lp-fs-panel lp-on" : "lp-fs-panel"}>
            {step.panel}
          </div>
        ))}
        <span className="lp-fs-sample">Data contoh</span>
      </div>
    </div>
  );
}
