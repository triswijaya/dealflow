"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./landing-icon";
import { CompareSlider } from "./compare-slider";
import { InvoiceDemo, KanbanDemo, QuotationDemo } from "./feature-demos";
import { HeroStory } from "./hero-story";
import { LANDING_ZOOM, useReveal, useScrollEffects, type CSSVars } from "./landing-hooks";
import { PricingPlans } from "./pricing-plans";
import { RoleSwitcher } from "./role-switcher";

const NAV_SECTIONS = ["produk", "tim", "harga", "faq"] as const;
const NAV_LABELS: Record<(typeof NAV_SECTIONS)[number], string> = { produk: "Produk", tim: "Untuk tim", harga: "Harga", faq: "FAQ" };

// What a typical team juggles today. Named the way people actually name these things.
const SCATTERED = ["Grup WhatsApp sales", "Sheet \u201cPipeline 2026\u201d", "Penawaran_FINAL_v3(2).pdf", "Buku tagihan finance"];

const HERO_FACTS = [
  { value: "5 tahap", label: "pipeline siap pakai, tanpa setup" },
  { value: "R0 \u2192 R2", label: "setiap revisi quotation tersimpan" },
  { value: "Rp \u00b7 WIB", label: "rupiah tanpa desimal, jadwal waktu Jakarta" },
];

type Feature = { id: string; kicker: string; title: string; body: string; facts: string[]; hint: string; demo: ReactNode };

const FEATURES: Feature[] = [
  {
    id: "pipeline",
    kicker: "Pipeline",
    title: "Buka pipeline, langsung tahu deal mana yang harus dikejar.",
    body: "Setiap deal punya tahap, nilai, dan sales yang memegangnya. Follow-up yang terlambat muncul paling atas, bukan terkubur di chat.",
    facts: ["Tahap tetap dari Baru sampai Negosiasi, lalu Menang atau Kalah", "Pengingat follow-up hari ini dan yang terlambat", "Alasan kalah tercatat untuk evaluasi"],
    hint: "Klik kartu bergaris untuk memajukan tahapnya.",
    demo: <KanbanDemo />,
  },
  {
    id: "quotation",
    kicker: "Quotation",
    title: "Revisi harga ketiga, tanpa kehilangan versi pertama.",
    body: "Quotation dibuat dari deal dan dihitung otomatis. Setiap revisi tersimpan sebagai versi baru yang bisa dibandingkan baris per baris.",
    facts: ["PDF siap kirim dengan data perusahaan Anda", "Bandingkan R0, R1, dan R2", "Pesan WhatsApp disiapkan, Anda yang menekan kirim"],
    hint: "Pindah R0, R1, R2 untuk melihat bagian yang berubah.",
    demo: <QuotationDemo />,
  },
  {
    id: "invoice",
    kicker: "Invoice & pembayaran",
    title: "Deal menang belum tentu uang masuk. DealFlow memisahkan keduanya.",
    body: "Finance membuat invoice dari deal yang Menang, mencatat pembayaran sebagian, dan langsung melihat siapa yang lewat jatuh tempo.",
    facts: ["Belum dibayar, Dibayar sebagian, Lunas, Lewat jatuh tempo", "Pembayaran tidak bisa melebihi sisa tagihan", "Transfer, tunai, atau metode lain dengan referensi"],
    hint: "Catat pembayaran sampai invoice lunas.",
    demo: <InvoiceDemo />,
  },
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const activeSection = useScrollEffects({ progress: progressRef, sticky: stickyRef, hero: heroRef, end: endRef, sectionIds: NAV_SECTIONS });
  useReveal(rootRef);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
    <div className="lp-root" ref={rootRef} style={{ zoom: LANDING_ZOOM }}>
        <a className="lp-skip" href="#konten">Lewati ke konten</a>
        <header className="lp-topnav">
          <div className="lp-container lp-navinner">
            <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow"><span><Icon name="brand" /></span>dealflow</a>
            <nav className="lp-navlinks" aria-label="Navigasi utama">
              {NAV_SECTIONS.map((id) => (
                <a key={id} href={`#${id}`} className={activeSection === id ? "lp-active" : undefined} aria-current={activeSection === id ? "location" : undefined}>{NAV_LABELS[id]}</a>
              ))}
            </nav>
            <div className="lp-navactions">
              <Link className="lp-btn lp-secondary" href="/login">Masuk</Link>
              <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
            </div>
            <button ref={menuButtonRef} type="button" className="lp-menu-toggle" aria-label={menuOpen ? "Tutup navigasi" : "Buka navigasi"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
              <Icon name="more" />
            </button>
          </div>
          <nav id="mobile-menu" className={menuOpen ? "lp-mobile-menu lp-open" : "lp-mobile-menu"} aria-label="Navigasi mobile" inert={!menuOpen} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
            {NAV_SECTIONS.map((id) => (
              <a key={id} href={`#${id}`}>{NAV_LABELS[id]}</a>
            ))}
            <Link href="/login">Masuk</Link>
            <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
          </nav>
          <div className="lp-progress" ref={progressRef} aria-hidden="true" />
        </header>
        <main id="konten">
          <section className="lp-hero lp-container" id="beranda" ref={heroRef}>
            <div className="lp-hero-grid">
              <div className="lp-hero-text">
                <p className="lp-kicker">Untuk tim sales dan finance bisnis B2B</p>
                <h1>Dari chat pertama sampai <span className="lp-marked"><span className="lp-marked-text">uang masuk.</span></span></h1>
                <p className="lp-hero-copy">Customer, penawaran, follow-up, dan tagihan di satu tempat. Sales tahu siapa yang harus dihubungi hari ini. Finance tahu siapa yang belum bayar.</p>
                <div className="lp-row lp-hero-actions">
                  <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
                  <a className="lp-btn lp-tertiary" href="#produk">Lihat produknya</a>
                </div>
                <dl className="lp-hero-facts">
                  {HERO_FACTS.map((fact) => (
                    <div key={fact.value}>
                      <dt>{fact.value}</dt>
                      <dd>{fact.label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <HeroStory />
            </div>
          </section>

          <section className="lp-scattered lp-container" aria-labelledby="scattered-title">
            <p id="scattered-title">Yang selama ini tersebar di</p>
            <ul>
              {SCATTERED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="lp-scattered-end">kini di satu ruang kerja.</p>
          </section>

          <section className="lp-section lp-container" id="masalah">
            <div className="lp-intro lp-reveal">
              <p className="lp-kicker">Masalahnya</p>
              <h2>Deal bisa hilang hanya karena satu follow-up terlewat.</h2>
              <p>Saat chat ada di WhatsApp, angka di spreadsheet, dan penawaran di folder, tidak ada yang melihat gambaran utuhnya. Geser untuk melihat bedanya.</p>
            </div>
            <div className="lp-reveal">
              <CompareSlider />
            </div>
          </section>

          <section className="lp-section lp-container" id="produk">
            <div className="lp-intro lp-reveal">
              <p className="lp-kicker">Produknya</p>
              <h2>Tiga layar yang akan dibuka tim Anda setiap hari.</h2>
            </div>
            <div className="lp-features">
              {FEATURES.map((feature, index) => (
                <article className={index % 2 ? "lp-feature-row lp-flip" : "lp-feature-row"} key={feature.id}>
                  <div className="lp-feature-copy lp-reveal">
                    <p className="lp-feature-kicker"><span>0{index + 1}</span>{feature.kicker}</p>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                    <ul className="lp-checklist">
                      {feature.facts.map((fact) => (
                        <li key={fact}><Icon name="check" /><span>{fact}</span></li>
                      ))}
                    </ul>
                  </div>
                  <div className="lp-feature-stage lp-reveal" style={{ "--d": 1 } as CSSVars}>
                    <div className="lp-feature-visual">{feature.demo}</div>
                    <p className="lp-try"><Icon name="pointer" />{feature.hint}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="lp-team" id="tim">
            <div className="lp-container lp-team-grid">
              <div className="lp-team-copy lp-reveal">
                <p className="lp-kicker">Untuk seluruh tim</p>
                <h2>Sales menutup deal, finance menagih, owner melihat semuanya.</h2>
                <p>Owner, Admin, Sales, dan Finance bekerja di data yang sama, dengan akses sesuai tanggung jawabnya. Pilih peran di samping untuk melihat apa yang mereka buka.</p>
                <ul className="lp-checklist">
                  <li><Icon name="check" /><span>Data perusahaan terpisah di ruang kerjanya sendiri.</span></li>
                  <li><Icon name="check" /><span>Setiap perubahan penting tercatat bersama siapa yang melakukannya.</span></li>
                  <li><Icon name="check" /><span>Quotation dan pesan WhatsApp tetap dikirim oleh tim Anda sendiri.</span></li>
                </ul>
              </div>
              <div className="lp-reveal" style={{ "--d": 1 } as CSSVars}>
                <RoleSwitcher />
              </div>
            </div>
          </section>

          <section className="lp-section lp-pricing-section" id="harga">
            <div className="lp-container">
              <div className="lp-intro lp-intro-center lp-reveal">
                <p className="lp-kicker">Harga</p>
                <h2>Bayar per perusahaan, bukan per orang.</h2>
                <p>Semua paket berisi alur yang sama. Yang berbeda hanya jumlah anggota tim.</p>
              </div>
              <div className="lp-pricing-note">
                <Icon name="info" />
                <span><b>Usulan paket untuk pratinjau.</b> Harga dan kapasitas berikut belum final dan belum tersedia untuk pembelian.</span>
              </div>
              <PricingPlans />
              <p className="lp-pricing-footer">Nominal adalah simulasi bulanan. Pajak, ketentuan penagihan, dan batas penggunaan akan ditetapkan pada harga resmi.</p>
            </div>
          </section>
          <section className="lp-section lp-container" id="faq">
            <div className="lp-faq-layout">
              <div className="lp-faq-copy lp-reveal">
                <p className="lp-kicker">FAQ</p>
                <h2>Pertanyaan yang biasanya muncul.</h2>
                <p>Belum terjawab? Buat ruang kerja, masukkan satu customer, dan lihat alurnya sendiri.</p>
              </div>
              <div className="lp-faq-list lp-reveal" style={{ "--d": 1 } as CSSVars}>
                <details name="faq" open>
                  <summary>
                    <span>DealFlow cocok untuk bisnis seperti apa?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>DealFlow dirancang untuk bisnis B2B yang mengelola peluang melalui quotation dan follow-up: vendor CCTV, networking, agency, kontraktor, dan event vendor. Alurnya tetap, sehingga tim tidak perlu mengatur pipeline dari awal.</p>
                </details>
                <details name="faq">
                  <summary>
                    <span>Apakah WhatsApp dikirim otomatis?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Tidak. DealFlow menyiapkan pesan yang bisa Anda edit lalu membuka WhatsApp. Anda tetap mengirim pesan sendiri. Membuka WhatsApp tidak otomatis mengubah status quotation atau menandai follow-up selesai.</p>
                </details>
                <details name="faq">
                  <summary>
                    <span>Apa bedanya deal Menang dan pembayaran diterima?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Deal Menang berarti kesepakatan sudah dikunci. Setelah itu, Owner, Admin, atau Finance dapat membuat invoice. Uang masuk baru tercatat ketika pembayaran dicatat pada invoice tersebut.</p>
                </details>
                <details name="faq">
                  <summary>
                    <span>Bisa mencatat pembayaran sebagian?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Bisa. Setiap pembayaran mengurangi sisa tagihan. Invoice dapat berstatus Belum dibayar, Dibayar sebagian, Lunas, atau Lewat jatuh tempo, sehingga tim tetap dapat melihat tagihan yang perlu ditindaklanjuti.</p>
                </details>
                <details name="faq">
                  <summary>
                    <span>Apakah satu akun bisa berpindah perusahaan?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Satu akun hanya aktif di satu organisasi. Owner membuat organisasi, lalu anggota lainnya bergabung melalui undangan. DealFlow tidak menggunakan pemilih multi-organisasi.</p>
                </details>
                <details name="faq">
                  <summary>
                    <span>Apakah harga di halaman ini sudah berlaku?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Belum. Bagian pricing ini adalah usulan untuk membantu meninjau penawaran paket. Harga, kapasitas anggota, pajak, dan ketentuan langganan harus ditetapkan sebelum penjualan dibuka.</p>
                </details>
              </div>
            </div>
          </section>
          <section className="lp-final-cta" ref={endRef}>
            <div className="lp-container">
              <div className="lp-cta-box lp-reveal">
              <h2>Rapikan pipeline Anda sebelum deal berikutnya terlewat.</h2>
              <p>Buat ruang kerja, undang tim, lalu masukkan customer pertama Anda.</p>
              <div className="lp-row lp-cta-actions">
                <Link className="lp-btn lp-lime" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
                <Link className="lp-btn lp-ghost-light" href="/login">Sudah punya akun? Masuk</Link>
              </div>
              </div>
            </div>
          </section>
        </main>
        <footer className="lp-footer">
          <div className="lp-container">
            <div className="lp-footer-top">
              <div className="lp-footer-brand">
                <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow"><span><Icon name="brand" /></span>dealflow</a>
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
        <div className="lp-sticky-cta" ref={stickyRef}>
          <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
        </div>
    </div>
  );
}
