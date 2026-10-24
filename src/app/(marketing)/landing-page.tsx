"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./landing-icon";
import { InvoiceDemo, KanbanDemo, QuotationDemo } from "./feature-demos";
import { useActiveSection, useReducedMotion, useReveal, useScrolled, type CSSVars } from "./landing-hooks";
import { PricingPlans } from "./pricing-plans";

const NAV = [
  { id: "produk", label: "Produk" },
  { id: "tim", label: "Untuk tim" },
  { id: "harga", label: "Harga" },
  { id: "faq", label: "FAQ" },
] as const;

// What a typical team juggles today, named the way people actually name these things.
const REPLACES = [
  { icon: "message", label: "Grup WhatsApp sales" },
  { icon: "sheet", label: "Sheet “Pipeline 2026”" },
  { icon: "fileText", label: "Penawaran_FINAL_v3(2).pdf" },
  { icon: "receipt", label: "Buku tagihan finance" },
] as const;

type Feature = { id: string; step: string; crumb: string; title: string; body: string; facts: string[]; hint: string; demo: ReactNode };

// The three screens in the order money moves through them.
const FEATURES: Feature[] = [
  {
    id: "pipeline",
    step: "Pipeline",
    crumb: "Pipeline",
    title: "Buka pipeline, langsung tahu deal mana yang harus dikejar.",
    body: "Setiap deal punya tahap, nilai, dan sales yang memegangnya. Follow-up yang terlambat muncul paling atas, bukan terkubur di chat.",
    facts: ["Tahap tetap dari Baru sampai Negosiasi, lalu Menang atau Kalah", "Pengingat follow-up hari ini dan yang terlambat", "Alasan kalah tercatat untuk evaluasi"],
    hint: "Klik kartu biru untuk memajukan tahapnya.",
    demo: <KanbanDemo />,
  },
  {
    id: "quotation",
    step: "Quotation",
    crumb: "Penawaran",
    title: "Revisi harga ketiga, tanpa kehilangan versi pertama.",
    body: "Quotation dibuat dari deal dan dihitung otomatis. Setiap revisi tersimpan sebagai versi baru yang bisa dibandingkan baris per baris.",
    facts: ["PDF siap kirim dengan data perusahaan Anda", "Bandingkan R0, R1, dan R2", "Pesan WhatsApp disiapkan, Anda yang menekan kirim"],
    hint: "Pindah R0, R1, R2 untuk melihat baris yang berubah.",
    demo: <QuotationDemo />,
  },
  {
    id: "invoice",
    step: "Invoice dan pembayaran",
    crumb: "Invoice",
    title: "Deal menang belum tentu uang masuk. DealFlow memisahkan keduanya.",
    body: "Finance membuat invoice dari deal yang Menang, mencatat pembayaran sebagian, dan langsung melihat siapa yang lewat jatuh tempo.",
    facts: ["Belum dibayar, Dibayar sebagian, Lunas, Lewat jatuh tempo", "Pembayaran tidak bisa melebihi sisa tagihan", "Transfer, tunai, atau metode lain dengan referensi"],
    hint: "Catat pembayaran sampai invoice lunas.",
    demo: <InvoiceDemo />,
  },
];

const ROLES = [
  { icon: "building", name: "Owner", opens: ["Ringkasan pipeline dan tagihan", "Semua deal, quotation, dan invoice", "Anggota tim dan perannya"] },
  { icon: "settings", name: "Admin", opens: ["Customer dan deal seluruh tim", "Profil dan ketentuan perusahaan", "Undangan anggota baru"] },
  { icon: "briefcase", name: "Sales", opens: ["Pipeline dan follow-up hari ini", "Quotation beserta revisinya", "Pesan WhatsApp yang siap dikirim"] },
  { icon: "receipt", name: "Finance", opens: ["Deal yang sudah menang", "Invoice dan pencatatan pembayaran", "Tagihan lewat jatuh tempo"] },
] as const;

const TRUST = [
  { icon: "lock", title: "Data tiap perusahaan terpisah", body: "Setiap ruang kerja hanya melihat datanya sendiri. Aksesnya diperiksa di server untuk setiap halaman dan aksi." },
  { icon: "calendar", title: "Setiap perubahan tercatat", body: "Perpindahan tahap, revisi quotation, dan pembayaran tercatat bersama siapa yang melakukannya dan kapan." },
  { icon: "wallet", title: "Rupiah dihitung pasti", body: "Total quotation dan invoice dihitung di server dalam rupiah utuh, tanpa pembulatan desimal yang menggeser angka." },
  { icon: "message", title: "WhatsApp tetap di tangan Anda", body: "DealFlow menyiapkan pesannya. Tim Anda yang membaca, mengubah, dan menekan kirim." },
] as const;

const FAQ = [
  {
    q: "DealFlow cocok untuk bisnis seperti apa?",
    a: "Bisnis B2B yang mengelola peluang lewat quotation dan follow-up: vendor CCTV, networking, agency, kontraktor, dan event vendor. Alurnya sudah tetap, jadi tim tidak perlu menyusun pipeline dari awal.",
  },
  {
    q: "Apakah WhatsApp dikirim otomatis?",
    a: "Tidak. DealFlow menyiapkan pesan yang bisa Anda ubah, lalu membuka WhatsApp. Anda tetap mengirimnya sendiri. Membuka WhatsApp juga tidak mengubah status quotation atau menandai follow-up selesai.",
  },
  {
    q: "Apa bedanya deal Menang dan pembayaran diterima?",
    a: "Deal Menang berarti kesepakatan sudah dikunci. Setelah itu Owner, Admin, atau Finance membuat invoice. Uang masuk baru tercatat ketika pembayaran dicatat pada invoice tersebut.",
  },
  {
    q: "Bisa mencatat pembayaran sebagian?",
    a: "Bisa. Setiap pembayaran mengurangi sisa tagihan, dan invoice berstatus Belum dibayar, Dibayar sebagian, Lunas, atau Lewat jatuh tempo.",
  },
  {
    q: "Apakah satu akun bisa berpindah perusahaan?",
    a: "Satu akun aktif di satu organisasi. Owner membuat organisasi, lalu anggota lain bergabung lewat undangan.",
  },
  {
    q: "Apakah harga di halaman ini sudah berlaku?",
    a: "Belum. Paket di halaman ini masih usulan. Harga, kapasitas anggota, pajak, dan ketentuan langganan ditetapkan sebelum penjualan dibuka.",
  },
];

type Station = { time: string; step: string; card: ReactNode };

const STATIONS: Station[] = [
  {
    time: "Sen 7 Sep · 09.12 WIB",
    step: "Chat masuk",
    card: (
      <>
        <span className="lp-from">Doni · PT Karya Teknik Utama</span>
        <p className="lp-bubble">Pak, bisa minta penawaran cabling untuk 3 lantai kantor kami?</p>
        <span className="lp-meta">
          <Icon name="message" />
          WhatsApp
        </span>
      </>
    ),
  },
  {
    time: "Sen 7 Sep · 11.40 WIB",
    step: "Deal dibuat",
    card: (
      <>
        <b className="lp-tcard-title">Smart building cabling</b>
        <span className="lp-amount">Rp56.000.000</span>
        <span className="lp-tcard-row">
          <span className="lp-badge">Baru</span>
          <span className="lp-avatar" aria-label="Sales: Andi Wijaya">
            AW
          </span>
        </span>
      </>
    ),
  },
  {
    time: "Rab 9 Sep · 15.05 WIB",
    step: "Quotation terkirim",
    card: (
      <>
        <span className="lp-doc">QT-2026-00008 · R2</span>
        <span className="lp-amount">Rp56.000.000</span>
        <span className="lp-tcard-row">
          <span className="lp-badge lp-badge-info">Terkirim</span>
          <span className="lp-meta">2 versi lama</span>
        </span>
      </>
    ),
  },
  {
    time: "Jum 18 Sep · 10.20 WIB",
    step: "Deal menang",
    card: (
      <>
        <b className="lp-tcard-title">Smart building cabling</b>
        <span className="lp-amount">Rp56.000.000</span>
        <span className="lp-tcard-row">
          <span className="lp-badge lp-badge-ok">Menang</span>
          <span className="lp-meta">Siap ditagih</span>
        </span>
      </>
    ),
  },
  {
    time: "Sel 6 Okt · 14.00 WIB",
    step: "Uang masuk",
    card: (
      <>
        <span className="lp-doc">INV-2026-00003</span>
        <span className="lp-amount">Rp56.000.000</span>
        <span className="lp-bar" aria-hidden="true">
          <span />
        </span>
        <span className="lp-tcard-row">
          <span className="lp-badge lp-badge-ok">Lunas</span>
          <span className="lp-meta">2 pembayaran</span>
        </span>
      </>
    ),
  },
];

const TRAIL_STEP_MS = 2600;
// The first highlight waits for the line to finish drawing on load.
const TRAIL_START_MS = 2400;

/**
 * One real-looking deal, followed from the first WhatsApp message to the paid
 * invoice. The highlight walks the stations on its own, stops while the
 * pointer or keyboard focus is on the trail, and follows the station hovered.
 */
function MoneyTrail() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(-1);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (reduced || held) return;
    let interval = 0;
    const timeout = window.setTimeout(() => {
      setActive((current) => (current + 1) % STATIONS.length);
      interval = window.setInterval(() => setActive((current) => (current + 1) % STATIONS.length), TRAIL_STEP_MS);
    }, active === -1 ? TRAIL_START_MS : TRAIL_STEP_MS);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
    // Restarting on every step would reset the timer; only the hold state matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, held]);

  return (
    <figure
      className="lp-trail"
      aria-labelledby="trail-caption"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <ol className="lp-trail-track">
        {STATIONS.map((station, index) => (
          <li
            key={station.step}
            className={["lp-station", index === STATIONS.length - 1 && "lp-station-end", index === active && "lp-station-active"].filter(Boolean).join(" ")}
            style={{ "--i": index } as CSSVars}
            onPointerEnter={() => setActive(index)}
          >
            <time className="lp-time">{station.time}</time>
            <span className="lp-dot" aria-hidden="true" />
            <p className="lp-step">{station.step}</p>
            <div className="lp-tcard">{station.card}</div>
          </li>
        ))}
      </ol>
      <figcaption id="trail-caption" className="lp-trail-caption">
        <span>Satu deal, 29 hari, tanpa pindah aplikasi.</span>
        <span className="lp-trail-legend">Contoh alur dari data demo</span>
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeSection = useActiveSection(NAV.map((item) => item.id));
  const scrolled = useScrolled();
  useReveal(rootRef);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="lp-root" ref={rootRef}>
      <a className="lp-skip" href="#konten">
        Lewati ke konten
      </a>
      <header className={scrolled ? "lp-nav lp-scrolled" : "lp-nav"}>
        <div className="lp-container lp-nav-inner">
          <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow">
            <span className="lp-mark">
              <Icon name="brand" />
            </span>
            DealFlow
          </a>
          <nav className="lp-nav-links" aria-label="Navigasi utama">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} className={activeSection === item.id ? "lp-active" : undefined} aria-current={activeSection === item.id ? "location" : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-actions">
            <Link className="lp-btn lp-btn-ghost" href="/login">
              Masuk
            </Link>
            <Link className="lp-btn lp-btn-primary" href="/register">
              Buat ruang kerja
            </Link>
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="lp-menu-toggle"
            aria-label={menuOpen ? "Tutup navigasi" : "Buka navigasi"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "plus" : "more"} />
          </button>
        </div>
        <nav
          id="mobile-menu"
          className={menuOpen ? "lp-mobile-menu lp-open" : "lp-mobile-menu"}
          aria-label="Navigasi mobile"
          inert={!menuOpen}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
          <Link href="/login">Masuk</Link>
          <Link className="lp-btn lp-btn-primary" href="/register">
            Buat ruang kerja
          </Link>
        </nav>
      </header>

      <main id="konten">
        <section className="lp-hero" id="beranda">
          <div className="lp-container">
            <div className="lp-hero-head">
              <div>
                <p className="lp-eyebrow">Untuk tim sales dan finance bisnis B2B</p>
                <h1>
                  Dari chat pertama <span className="lp-line">sampai uang masuk.</span>
                </h1>
              </div>
              <div className="lp-hero-side">
                <p>Customer, penawaran, follow-up, dan tagihan di satu tempat. Sales tahu siapa yang harus dihubungi hari ini. Finance tahu siapa yang belum bayar.</p>
                <div className="lp-actions">
                  <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/register">
                    Buat ruang kerja
                    <Icon name="arrowRight" />
                  </Link>
                  <a className="lp-btn lp-btn-secondary lp-btn-lg" href="#produk">
                    Lihat produknya
                  </a>
                </div>
              </div>
            </div>
            <MoneyTrail />
          </div>
        </section>

        <section className="lp-replaces" aria-labelledby="replaces-title">
          <div className="lp-container lp-replaces-inner">
            <p id="replaces-title" className="lp-replaces-label">
              Menggantikan
            </p>
            <ul className="lp-reveal">
              {REPLACES.map((item) => (
                <li key={item.label}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <p className="lp-replaces-end">
              <Icon name="arrowRight" />
              satu ruang kerja
            </p>
          </div>
        </section>

        <section className="lp-section" id="produk" aria-labelledby="produk-title">
          <div className="lp-container">
            <div className="lp-section-head lp-reveal">
              <div>
                <p className="lp-eyebrow">Produk</p>
                <h2 id="produk-title">Tiga layar yang dibuka tim Anda setiap hari.</h2>
              </div>
              <p>Urutannya sama dengan jalan uang: peluang dikejar di pipeline, harga disepakati di quotation, lalu ditagih sampai lunas.</p>
            </div>
            <div className="lp-features">
              {FEATURES.map((feature, index) => (
                <article className="lp-feature" key={feature.id} aria-labelledby={`${feature.id}-title`}>
                  <div className="lp-feature-copy lp-reveal">
                    <p className="lp-feature-step">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {feature.step}
                    </p>
                    <h3 id={`${feature.id}-title`}>{feature.title}</h3>
                    <p>{feature.body}</p>
                    <ul className="lp-checks">
                      {feature.facts.map((fact) => (
                        <li key={fact}>
                          <Icon name="check" />
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="lp-feature-stage lp-reveal" style={{ "--d": 2 } as CSSVars}>
                    <div className="lp-window">
                      <div className="lp-window-bar">
                        <span className="lp-window-crumb">
                          NusaTech Solutions <span aria-hidden="true">›</span> <b>{feature.crumb}</b>
                        </span>
                        <span className="lp-window-search" aria-hidden="true">
                          Cari customer, deal, dokumen
                        </span>
                      </div>
                      <div className="lp-window-body">{feature.demo}</div>
                    </div>
                    <p className="lp-try">
                      <Icon name="pointer" />
                      {feature.hint}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-band" id="tim" aria-labelledby="tim-title">
          <div className="lp-container">
            <div className="lp-section-head lp-reveal">
              <div>
                <p className="lp-eyebrow">Untuk seluruh tim</p>
                <h2 id="tim-title">Sales menutup deal, finance menagih, owner melihat semuanya.</h2>
              </div>
              <p>Empat peran bekerja di data yang sama, masing-masing dengan akses sesuai tanggung jawabnya.</p>
            </div>
            <div className="lp-roles">
              {ROLES.map((role, index) => (
                <article className="lp-role lp-reveal" key={role.name} style={{ "--d": index } as CSSVars}>
                  <span className="lp-role-icon">
                    <Icon name={role.icon} />
                  </span>
                  <h3>{role.name}</h3>
                  <p className="lp-role-label">Membuka</p>
                  <ul>
                    {role.opens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="trust-title">
          <div className="lp-container lp-trust">
            <div className="lp-trust-copy lp-reveal">
              <p className="lp-eyebrow">Kepercayaan</p>
              <h2 id="trust-title">Dibuat untuk angka yang tidak boleh meleset.</h2>
              <p>Penawaran dan tagihan adalah janji ke customer. DealFlow menjaganya tetap utuh dan bisa ditelusuri.</p>
            </div>
            <ul className="lp-trust-grid">
              {TRUST.map((item, index) => (
                <li key={item.title} className="lp-reveal" style={{ "--d": index + 1 } as CSSVars}>
                  <Icon name={item.icon} />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-band" id="harga" aria-labelledby="harga-title">
          <div className="lp-container">
            <div className="lp-section-head lp-section-head-center lp-reveal">
              <div>
                <p className="lp-eyebrow">Harga</p>
                <h2 id="harga-title">Bayar per perusahaan, bukan per orang.</h2>
              </div>
              <p>Semua paket berisi alur yang sama. Yang berbeda hanya jumlah anggota tim.</p>
            </div>
            <p className="lp-note">
              <Icon name="info" />
              <span>
                <b>Usulan paket untuk pratinjau.</b> Harga dan kapasitas berikut belum final dan belum tersedia untuk pembelian.
              </span>
            </p>
            <PricingPlans />
            <p className="lp-fineprint">Nominal adalah simulasi bulanan. Pajak, ketentuan penagihan, dan batas penggunaan ditetapkan pada harga resmi.</p>
          </div>
        </section>

        <section className="lp-section" id="faq" aria-labelledby="faq-title">
          <div className="lp-container lp-faq">
            <div className="lp-faq-copy lp-reveal">
              <p className="lp-eyebrow">FAQ</p>
              <h2 id="faq-title">Pertanyaan yang biasanya muncul.</h2>
              <p>Belum terjawab? Buat ruang kerja, masukkan satu customer, dan lihat alurnya sendiri.</p>
            </div>
            <div className="lp-faq-list lp-reveal" style={{ "--d": 2 } as CSSVars}>
              {FAQ.map((item, index) => (
                <details name="faq" key={item.q} open={index === 0}>
                  <summary>
                    <span>{item.q}</span>
                    <Icon name="plus" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-container">
            <div className="lp-final-box lp-reveal">
              <div className="lp-final-trail" aria-hidden="true">
                {STATIONS.map((station, index) => (
                  <span key={station.step} style={{ "--i": index } as CSSVars} />
                ))}
              </div>
              <div>
                <h2 id="final-title">Rapikan pipeline Anda sebelum deal berikutnya terlewat.</h2>
                <p>Buat ruang kerja, undang tim, lalu masukkan customer pertama Anda.</p>
              </div>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/register">
                  Buat ruang kerja
                  <Icon name="arrowRight" />
                </Link>
                <Link className="lp-btn lp-btn-on-dark lp-btn-lg" href="/login">
                  Sudah punya akun? Masuk
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow">
                <span className="lp-mark">
                  <Icon name="brand" />
                </span>
                DealFlow
              </a>
              <p>Dari calon customer sampai pembayaran, dalam satu alur.</p>
            </div>
            <div className="lp-footer-links">
              <div>
                <h3>Jelajahi</h3>
                <a href="#produk">Produk</a>
                <a href="#tim">Untuk tim</a>
                <a href="#harga">Harga</a>
              </div>
              <div>
                <h3>Mulai</h3>
                <Link href="/register">Buat ruang kerja</Link>
                <Link href="/login">Masuk</Link>
                <a href="#faq">FAQ</a>
              </div>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>© 2026 DealFlow</span>
            <span>Dibuat untuk alur penjualan bisnis B2B Indonesia.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
