"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Icon } from "./landing-icon";
import { CompareSlider } from "./compare-slider";
import { InvoiceDemo, KanbanDemo, QuotationDemo } from "./feature-demos";
import { FlowStepper } from "./flow-stepper";
import { HeroStory } from "./hero-story";
import { LANDING_ZOOM, useReveal, useScrollEffects, type CSSVars } from "./landing-hooks";
import { PricingPlans } from "./pricing-plans";
import { RoleSwitcher } from "./role-switcher";

const TAB_ORDER = ["pipeline", "quotation", "invoice"] as const;
type PreviewTab = (typeof TAB_ORDER)[number];

const PREVIEW_TABS: Record<PreviewTab, { label: string; title: string; subtitle: string; nav: string }> = {
  pipeline: {
    label: "Pipeline",
    title: "Peluang yang terus bergerak.",
    subtitle: "Setiap deal punya tahap, nilai, dan penanggung jawab yang jelas.",
    nav: "Pipeline",
  },
  quotation: {
    label: "Quotation",
    title: "Penawaran rapi. Revisi terlacak.",
    subtitle: "Siapkan quotation untuk customer, lengkap dengan riwayat versinya.",
    nav: "Penawaran",
  },
  invoice: {
    label: "Invoice",
    title: "Sisa tagihan terlihat jelas.",
    subtitle: "Pisahkan nilai kesepakatan dari pembayaran yang sudah diterima.",
    nav: "Invoice",
  },
};

const NAV_SECTIONS = ["produk", "cara-kerja", "harga", "faq"] as const;
const NAV_LABELS: Record<(typeof NAV_SECTIONS)[number], string> = { produk: "Produk", "cara-kerja": "Cara kerja", harga: "Harga", faq: "FAQ" };

const AUDIENCE = [
  { icon: "grid", label: "Vendor CCTV" },
  { icon: "brand", label: "IT & networking" },
  { icon: "briefcase", label: "Digital agency" },
  { icon: "fileText", label: "Software house" },
  { icon: "building", label: "Kontraktor & interior" },
  { icon: "sheet", label: "Printing & signage" },
  { icon: "calendar", label: "Event vendor" },
  { icon: "settings", label: "Jasa maintenance" },
] as const;

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const activeSection = useScrollEffects({ progress: progressRef, sticky: stickyRef, hero: heroRef, end: endRef, sectionIds: NAV_SECTIONS });
  useReveal(rootRef);
  const [activeTab, setActiveTab] = useState<PreviewTab>("pipeline");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<PreviewTab, HTMLButtonElement | null>>>({});

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

  // Cards marked .lp-spot get a soft highlight that follows the pointer.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    function onMove(event: PointerEvent) {
      const card = (event.target as HTMLElement).closest<HTMLElement>(".lp-spot");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--y", `${event.clientY - rect.top}px`);
    }
    root.addEventListener("pointermove", onMove);
    return () => root.removeEventListener("pointermove", onMove);
  }, []);

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, tab: PreviewTab) {
    const index = TAB_ORDER.indexOf(tab);
    const next = {
      ArrowRight: TAB_ORDER[(index + 1) % TAB_ORDER.length],
      ArrowLeft: TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length],
      Home: TAB_ORDER[0],
      End: TAB_ORDER[TAB_ORDER.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  }

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
            <a href="#produk">Produk</a>
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#harga">Harga</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Masuk</Link>
            <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
          </nav>
          <div className="lp-progress" ref={progressRef} aria-hidden="true" />
        </header>
        <main id="konten">
          <div className="lp-atmos">
          <div className="lp-atmos-bg" aria-hidden="true"><i className="lp-blob lp-b1" /><i className="lp-blob lp-b2" /><i className="lp-blob lp-b3" /><i className="lp-dots" /></div>
          <section className="lp-hero lp-container" id="beranda" ref={heroRef}>
            <div className="lp-hero-grid">
            <div className="lp-hero-text">
            <div className="lp-hero-pill"><Icon name="briefcase" />Ruang kerja penjualan untuk bisnis B2B</div>
            <h1>
              <span className="lp-w" style={{ "--i": 0 } as CSSVars}>Dari</span>{" "}
              <span className="lp-w" style={{ "--i": 1 } as CSSVars}>chat</span>{" "}
              <span className="lp-w" style={{ "--i": 2 } as CSSVars}>pertama</span>{" "}
              <span className="lp-w" style={{ "--i": 3 } as CSSVars}>sampai</span>{" "}
              <span className="lp-w" style={{ "--i": 4 } as CSSVars}><span className="lp-marked">uang masuk.</span></span>
            </h1>
            <p className="lp-hero-copy">Customer, deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur. Tidak ada lagi deal yang menang tapi tagihannya terlupa.</p>
            <div className="lp-row lp-hero-actions">
              <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
              <a className="lp-btn lp-tertiary" href="#cara-kerja">Lihat cara kerjanya</a>
            </div>
            <p className="lp-hero-caption">
              <span>Untuk tim penjualan Indonesia</span>
              <span>Rupiah & waktu WIB</span>
            </p>
            </div>
            <HeroStory />
            </div>
            <div className="lp-product-stage" id="preview-produk">
              <div className="lp-product-window">
                <div className="lp-window-top">
                  <div className="lp-window-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="lp-window-location">
                    <Icon name="lock" />
                    <span>DealFlow / NusaTech Solutions</span>
                  </div>
                  <span className="lp-data-label">Data contoh</span>
                </div>
                <div className="lp-product-shell">
                  <aside className="lp-mini-sidebar" aria-label="Ilustrasi navigasi produk">
                    <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow"><span><Icon name="brand" /></span>dealflow</a>
                    <div className="lp-mini-org">
                      <b>NusaTech Solutions</b>
                      <small>Ruang kerja perusahaan</small>
                    </div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Ringkasan" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="grid" />Ringkasan</div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Pipeline" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="brand" />Pipeline</div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Customer" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="users" />Customer</div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Penawaran" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="fileText" />Penawaran</div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Follow-up" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="calendar" />Follow-up</div>
                    <div className={PREVIEW_TABS[activeTab].nav === "Invoice" ? "lp-mini-nav lp-active" : "lp-mini-nav"}><Icon name="wallet" />Invoice</div>
                  </aside>
                  <div className="lp-product-main">
                    <div className="lp-product-heading">
                      <div>
                        <div className="lp-mh">{PREVIEW_TABS[activeTab].title}</div>
                        <p>{PREVIEW_TABS[activeTab].subtitle}</p>
                      </div>
                      <span className="lp-mini-avatar" title="Aditya Pratama">AP</span>
                    </div>
                    <div className="lp-preview-tabs" role="tablist" aria-label="Jelajahi preview produk">
                      {TAB_ORDER.map((tab) => (
                        <button key={tab} ref={(el) => { tabRefs.current[tab] = el; }} type="button" role="tab" id={`tab-${tab}`} aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => handleTabKey(event, tab)}>{PREVIEW_TABS[tab].label}</button>
                      ))}
                    </div>
                    <div id="panel-pipeline" className="lp-preview-panel" role="tabpanel" aria-labelledby="tab-pipeline" hidden={activeTab !== "pipeline"}>
                      <div className="lp-mini-board">
                        <div className="lp-mini-column">
                          <div className="lp-mh">Terkualifikasi<span className="lp-mini-tag">1</span></div>
                          <p>Rp18.000.000</p>
                          <article className="lp-mini-deal">
                            <small>PT Sentra Niaga</small>
                            <div className="lp-mh">Maintenance tahunan CCTV</div>
                            <strong>Rp18.000.000</strong>
                            <div className="lp-row"><span className="lp-mini-avatar">AS</span>Aktivitas kemarin</div>
                          </article>
                        </div>
                        <div className="lp-mini-column">
                          <div className="lp-mh">Penawaran<span className="lp-mini-tag">1</span></div>
                          <p>Rp48.500.000</p>
                          <article className="lp-mini-deal">
                            <small>PT Bumi Karya</small>
                            <div className="lp-mh">Upgrade jaringan kantor</div>
                            <strong>Rp48.500.000</strong>
                            <div className="lp-row"><span className="lp-mini-avatar">RP</span>Aktivitas kemarin</div>
                          </article>
                        </div>
                        <div className="lp-mini-column">
                          <div className="lp-mh">Negosiasi<span className="lp-mini-tag">1</span></div>
                          <p>Rp30.000.000</p>
                          <article className="lp-mini-deal">
                            <small>PT Maju Jaya</small>
                            <div className="lp-mh">CCTV Installation - Bekasi</div>
                            <strong>Rp30.000.000</strong>
                            <div className="lp-row"><span className="lp-mini-avatar">AS</span>Aktivitas kemarin</div>
                          </article>
                        </div>
                      </div>
                    </div>
                    <div id="panel-quotation" className="lp-preview-panel" role="tabpanel" aria-labelledby="tab-quotation" hidden={activeTab !== "quotation"}>
                      <div className="lp-quote-grid">
                        <div className="lp-mini-invoice">
                          <div className="lp-mini-invoice-head">
                            <div className="lp-mh">QT-2026-00042-R1</div>
                            <span className="lp-mini-status">Terkirim</span>
                          </div>
                          <p>PT Maju Jaya · CCTV Installation - Bekasi</p>
                          <div className="lp-mini-items">
                            <div className="lp-mini-item">
                              <span>CCTV Camera 4MP<small>4 pcs × Rp1.500.000</small></span>
                              <strong>Rp6.000.000</strong>
                            </div>
                            <div className="lp-mini-item">
                              <span>Instalasi & konfigurasi<small>1 paket × Rp6.000.000</small></span>
                              <strong>Rp6.000.000</strong>
                            </div>
                            <div className="lp-mini-item">
                              <span>Kabel UTP Cat6<small>120 meter × Rp12.500</small></span>
                              <strong>Rp1.500.000</strong>
                            </div>
                          </div>
                          <div className="lp-quote-total">Rp13.500.000</div>
                        </div>
                        <div className="lp-version-note">
                          <div className="lp-mh">Versi terbaru, konteks tetap utuh.</div>
                          <p>Revisi R1 · 26 Sep 2026<br />Berlaku sampai 10 Okt 2026</p>
                          <div style={{ height: "1px", background: "#D5DFCA", margin: "18px 0" }} />
                          <div className="lp-mh">QT-2026-00042</div>
                          <p>Versi lama · hanya baca<br />Riwayat penawaran tetap tersimpan.</p>
                        </div>
                      </div>
                    </div>
                    <div id="panel-invoice" className="lp-preview-panel" role="tabpanel" aria-labelledby="tab-invoice" hidden={activeTab !== "invoice"}>
                      <div className="lp-mini-invoice">
                        <div className="lp-mini-invoice-head">
                          <div className="lp-mh">INV-2026-00001</div>
                          <span className="lp-mini-status">Dibayar sebagian</span>
                        </div>
                        <p>Klinik Sehat Sentosa · Paket CCTV klinik</p>
                        <div className="lp-balance-grid">
                          <div className="lp-balance">
                            <small>Total invoice</small>
                            <strong>Rp30.000.000</strong>
                          </div>
                          <div className="lp-balance">
                            <small>Terbayar</small>
                            <strong>Rp10.000.000</strong>
                          </div>
                          <div className="lp-balance lp-dark">
                            <small>Sisa tagihan</small>
                            <strong>Rp20.000.000</strong>
                          </div>
                        </div>
                        <div className="lp-mini-progress" aria-label="Terbayar 33,33 persen">
                          <i />
                        </div>
                        <div className="lp-mini-record">
                          <span>Transfer bank · 22 Sep 2026</span>
                          <span>Jatuh tempo 20 Okt 2026</span>
                        </div>
                      </div>
                    </div>
                    <div className="lp-product-foot">
                      <span><Icon name="check" />Satu ruang kerja. Konteks penjualan tetap utuh.</span>
                      <span>27 Sep 2026</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lp-preview-caption">
                <span>Jelajahi tiga bagian alur dengan tab di atas.</span>
                <a href="#cara-kerja">Lihat alur lengkap</a>
              </div>
            </div>
          </section>
          </div>
          <section className="lp-audience lp-container" aria-label="Bisnis yang cocok">
            <p>Dibuat untuk bisnis yang menjual lewat percakapan dan penawaran.</p>
            <div className="lp-marquee">
              <div className="lp-track">
                {[false, true].map((copy) =>
                  AUDIENCE.map((item) => (
                    <span key={`${copy}-${item.label}`} aria-hidden={copy || undefined}><Icon name={item.icon} />{item.label}</span>
                  )),
                )}
              </div>
            </div>
          </section>
          <section className="lp-section lp-container" id="masalah">
            <div className="lp-center-intro lp-reveal">
              <p className="lp-eyebrow">Kenapa DealFlow</p>
              <h2>Deal Anda tersebar di<br />empat tempat berbeda.</h2>
              <p>Chat di WhatsApp, angka di spreadsheet, penawaran di folder, tagihan di buku finance. Begitu satu tertinggal, peluang ikut hilang.</p>
            </div>
            <div className="lp-reveal">
              <CompareSlider />
            </div>
          </section>
          <section className="lp-section lp-container lp-grid-bg" id="produk">
            <div className="lp-section-intro lp-reveal">
              <div>
                <p className="lp-eyebrow">Lebih sedikit yang tercecer</p>
                <h2>Fokus ke peluangnya.<br />Bukan mencari catatannya.</h2>
              </div>
              <p>Dari sales sampai finance, setiap orang bekerja dengan konteks yang sama dan langkah berikutnya yang jelas.</p>
            </div>
            <div className="lp-feature-grid">
              <article className="lp-feature lp-spot lp-reveal" style={{ "--d": 0 } as CSSVars}>
                <div className="lp-feature-number">
                  <span>01</span>
                  <Icon name="brand" />
                </div>
                <div className="lp-feature-visual">
                  <KanbanDemo />
                </div>
                <h3>Tahu deal mana yang perlu bergerak.</h3>
                <p>Lihat peluang dari Baru sampai Negosiasi. Nilai, customer, dan penanggung jawab ada di setiap deal.</p>
                <p className="lp-feature-note">Pipeline tetap, mudah dipahami seluruh tim.</p>
                <p className="lp-try"><Icon name="pointer" />Klik kartu bergaris untuk memajukan tahapnya.</p>
              </article>
              <article className="lp-feature lp-spot lp-reveal" style={{ "--d": 1 } as CSSVars}>
                <div className="lp-feature-number">
                  <span>02</span>
                  <Icon name="fileText" />
                </div>
                <div className="lp-feature-visual">
                  <QuotationDemo />
                </div>
                <h3>Penawaran rapi. Percakapan berlanjut.</h3>
                <p>Susun quotation, simpan revisinya, dan jadwalkan follow-up. Buka WhatsApp dengan pesan yang dapat Anda sesuaikan.</p>
                <p className="lp-feature-note">Riwayat penawaran tidak hilang saat direvisi.</p>
                <p className="lp-try"><Icon name="pointer" />Pindah R0, R1, R2 untuk melihat bagian yang berubah.</p>
              </article>
              <article className="lp-feature lp-spot lp-reveal" style={{ "--d": 2 } as CSSVars}>
                <div className="lp-feature-number">
                  <span>03</span>
                  <Icon name="wallet" />
                </div>
                <div className="lp-feature-visual">
                  <InvoiceDemo />
                </div>
                <h3>Menang sudah. Dibayar belum?</h3>
                <p>Buat invoice dari deal Menang, catat pembayaran, dan lihat sisa tagihan. Kesepakatan dan uang masuk terlihat terpisah.</p>
                <p className="lp-feature-note">Pembayaran parsial dan jatuh tempo tetap terlihat.</p>
                <p className="lp-try"><Icon name="pointer" />Catat pembayaran sampai invoice lunas.</p>
              </article>
            </div>
          </section>
          <section className="lp-flow-section" id="cara-kerja">
            <i className="lp-aurora" aria-hidden="true" />
            <i className="lp-beam" aria-hidden="true" />
            <div className="lp-container">
              <div className="lp-flow-header lp-reveal">
                <div>
                  <p className="lp-eyebrow">Dari sales ke finance</p>
                  <h2>Satu alur. Sampai<br />pembayaran terakhir.</h2>
                </div>
                <p>DealFlow mengikuti cara bisnis B2B bekerja: kenali kebutuhannya, ajukan penawaran, lalu tuntaskan kesepakatannya.</p>
              </div>
              <div className="lp-reveal">
                <FlowStepper />
              </div>
              <p className="lp-flow-note"><Icon name="info" />Pengiriman quotation dan pesan WhatsApp dilakukan oleh tim Anda. DealFlow membantu menyiapkan dan mencatat alurnya.</p>
            </div>
          </section>
          <section className="lp-section lp-container">
            <div className="lp-roles">
              <div className="lp-roles-copy lp-reveal">
                <p className="lp-eyebrow">Satu tim, peran yang jelas</p>
                <h2>Sales maju.<br />Finance tahu.</h2>
                <p>Owner, Admin, Sales, dan Finance memiliki akses sesuai tanggung jawabnya. Tim penjualan menjaga peluang; finance menindaklanjuti deal yang sudah Menang.</p>
                <ul className="lp-checklist">
                  <li>
                    <Icon name="check" />
                    <span>Data perusahaan berada dalam ruang kerja sendiri.</span>
                  </li>
                  <li>
                    <Icon name="check" />
                    <span>Aktivitas penting tercatat bersama aktornya.</span>
                  </li>
                  <li>
                    <Icon name="check" />
                    <span>Rupiah tanpa desimal dan jadwal dalam WIB.</span>
                  </li>
                </ul>
              </div>
              <div className="lp-reveal" style={{ "--d": 1 } as CSSVars}>
                <RoleSwitcher />
              </div>
            </div>
          </section>
          <section className="lp-section lp-pricing-section" id="harga">
            <div className="lp-container">
              <div className="lp-center-intro lp-reveal">
                <p className="lp-eyebrow">Paket sesuai ukuran tim</p>
                <h2>Ruang untuk mulai.<br />Ruang untuk bertumbuh.</h2>
                <p>Satu alur inti di setiap paket. Pilih kapasitas anggota yang sesuai dengan cara tim Anda bekerja.</p>
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
                <p className="lp-eyebrow">Sebelum mulai</p>
                <h2>Yang sering<br />ingin ditanyakan.</h2>
                <p>Kenali cara kerja DealFlow dan lihat apakah alurnya sesuai untuk bisnis Anda.</p>
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
            <div className="lp-floaty lp-f1" style={{ "--i": 0 } as CSSVars} aria-hidden="true"><Icon name="trophy" />Deal Menang</div>
            <div className="lp-floaty lp-f2" style={{ "--i": 1 } as CSSVars} aria-hidden="true"><span className="lp-bd lp-bd-lime">Lunas</span>Rp30.000.000</div>
            <div className="lp-floaty lp-f4" style={{ "--i": 3 } as CSSVars} aria-hidden="true"><Icon name="fileText" />QUO-0018 · R1</div>
            <div className="lp-container lp-cta-box lp-reveal">
              <div>
                <p className="lp-eyebrow">Peluang berikutnya, lebih tertata</p>
                <h2>Bangun percakapannya.<br />Jaga sampai jadi pembayaran.</h2>
                <p>Mulai dari satu customer. Lanjutkan dalam satu alur.</p>
              </div>
              <Link className="lp-btn lp-primary" href="/register">Buat ruang kerja<Icon name="arrowRight" /></Link>
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
                  <a href="#cara-kerja">Cara kerja</a>
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
