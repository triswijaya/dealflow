"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Icon } from "./landing-icon";

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

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="lp-root">
        <a className="lp-skip" href="#konten">Lewati ke konten</a>
        <header className="lp-topnav">
          <div className="lp-container lp-navinner">
            <a className="lp-brand" href="#beranda" aria-label="Beranda DealFlow"><span><Icon name="brand" /></span>dealflow</a>
            <nav className="lp-navlinks" aria-label="Navigasi utama">
              <a href="#produk">Produk</a>
              <a href="#cara-kerja">Cara kerja</a>
              <a href="#harga">Harga</a>
              <a href="#faq">FAQ</a>
            </nav>
            <div className="lp-navactions">
              <Link className="lp-btn lp-secondary" href="/login">Masuk</Link>
              <a className="lp-btn lp-primary" href="#cara-kerja">Lihat cara kerjanya<Icon name="arrowRight" /></a>
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
            <a className="lp-btn lp-primary" href="#cara-kerja">Lihat cara kerjanya<Icon name="arrowRight" /></a>
          </nav>
        </header>
        <main id="konten">
          <section className="lp-hero lp-container" id="beranda">
            <div className="lp-hero-pill"><Icon name="briefcase" />Ruang kerja penjualan untuk bisnis B2B</div>
            <h1>Deal makin jelas.<br />Pembayaran <span className="lp-marked">makin dekat.</span></h1>
            <p className="lp-hero-copy">Rapikan customer, penawaran, dan follow-up dalam satu alur. Supaya peluang yang tim Anda bangun terus bergerak sampai dibayar.</p>
            <div className="lp-row lp-hero-actions">
              <a className="lp-btn lp-primary" href="#cara-kerja">Lihat cara kerjanya<Icon name="arrowRight" /></a>
            </div>
            <p className="lp-hero-caption">
              <span>Untuk tim penjualan Indonesia</span>
              <span>Rupiah & waktu WIB</span>
            </p>
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
          <section className="lp-audience lp-container" aria-label="Bisnis yang cocok">
            <p>Dibuat untuk bisnis yang menjual lewat percakapan dan penawaran.</p>
            <div className="lp-audience-list">
              <span><Icon name="grid" />Vendor CCTV</span>
              <span><Icon name="brand" />Networking & IT</span>
              <span><Icon name="briefcase" />Digital agency</span>
              <span><Icon name="building" />Kontraktor</span>
              <span><Icon name="calendar" />Event vendor</span>
            </div>
          </section>
          <section className="lp-section lp-container" id="produk">
            <div className="lp-section-intro">
              <div>
                <p className="lp-eyebrow">Lebih sedikit yang tercecer</p>
                <h2>Fokus ke peluangnya.<br />Bukan mencari catatannya.</h2>
              </div>
              <p>Dari sales sampai finance, setiap orang bekerja dengan konteks yang sama dan langkah berikutnya yang jelas.</p>
            </div>
            <div className="lp-feature-grid">
              <article className="lp-feature">
                <div className="lp-feature-number">
                  <span>01</span>
                  <Icon name="brand" />
                </div>
                <h3>Tahu deal mana yang perlu bergerak.</h3>
                <p>Lihat peluang dari Baru sampai Negosiasi. Nilai, customer, dan penanggung jawab ada di setiap deal.</p>
                <p className="lp-feature-note">Pipeline tetap, mudah dipahami seluruh tim.</p>
              </article>
              <article className="lp-feature">
                <div className="lp-feature-number">
                  <span>02</span>
                  <Icon name="fileText" />
                </div>
                <h3>Penawaran rapi. Percakapan berlanjut.</h3>
                <p>Susun quotation, simpan revisinya, dan jadwalkan follow-up. Buka WhatsApp dengan pesan yang dapat Anda sesuaikan.</p>
                <p className="lp-feature-note">Riwayat penawaran tidak hilang saat direvisi.</p>
              </article>
              <article className="lp-feature">
                <div className="lp-feature-number">
                  <span>03</span>
                  <Icon name="wallet" />
                </div>
                <h3>Menang sudah. Dibayar belum?</h3>
                <p>Buat invoice dari deal Menang, catat pembayaran, dan lihat sisa tagihan. Kesepakatan dan uang masuk terlihat terpisah.</p>
                <p className="lp-feature-note">Pembayaran parsial dan jatuh tempo tetap terlihat.</p>
              </article>
            </div>
          </section>
          <section className="lp-flow-section" id="cara-kerja">
            <div className="lp-container">
              <div className="lp-flow-header">
                <div>
                  <p className="lp-eyebrow">Dari sales ke finance</p>
                  <h2>Satu alur. Sampai<br />pembayaran terakhir.</h2>
                </div>
                <p>DealFlow mengikuti cara bisnis B2B bekerja: kenali kebutuhannya, ajukan penawaran, lalu tuntaskan kesepakatannya.</p>
              </div>
              <div className="lp-flow-track">
                <div className="lp-flow-step">
                  <div className="lp-flow-node">
                    <b>1</b>
                  </div>
                  <h3>Customer</h3>
                  <p>Simpan perusahaan, kontak, dan konteks percakapan.</p>
                </div>
                <div className="lp-flow-step">
                  <div className="lp-flow-node">
                    <b>2</b>
                  </div>
                  <h3>Deal</h3>
                  <p>Catat kebutuhan, nilai peluang, dan sales yang menangani.</p>
                </div>
                <div className="lp-flow-step">
                  <div className="lp-flow-node">
                    <b>3</b>
                  </div>
                  <h3>Penawaran</h3>
                  <p>Buat quotation dan PDF setelah kebutuhan makin jelas.</p>
                </div>
                <div className="lp-flow-step">
                  <div className="lp-flow-node">
                    <b>4</b>
                  </div>
                  <h3>Follow-up</h3>
                  <p>Jadwalkan interaksi sampai deal Menang atau Kalah.</p>
                </div>
                <div className="lp-flow-step">
                  <div className="lp-flow-node">
                    <b>5</b>
                  </div>
                  <h3>Pembayaran</h3>
                  <p>Terbitkan invoice dari deal Menang dan catat uang masuk.</p>
                </div>
              </div>
              <p className="lp-flow-note"><Icon name="info" />Pengiriman quotation dan pesan WhatsApp dilakukan oleh tim Anda. DealFlow membantu menyiapkan dan mencatat alurnya.</p>
            </div>
          </section>
          <section className="lp-section lp-container">
            <div className="lp-roles">
              <div className="lp-roles-copy">
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
              <div className="lp-role-board">
                <div className="lp-role-board-header">
                  <span>Akses sesuai peran</span>
                  <Icon name="lock" />
                </div>
                <div className="lp-role-row">
                  <span className="lp-role-icon">
                    <Icon name="grid" />
                  </span>
                  <div>
                    <h3>Owner & Admin</h3>
                    <p>Melihat keseluruhan alur, mengelola anggota, dan mengatur profil perusahaan.</p>
                    <span className="lp-scope">Gambaran bisnis & pengelolaan tim</span>
                  </div>
                </div>
                <div className="lp-role-row">
                  <span className="lp-role-icon">
                    <Icon name="briefcase" />
                  </span>
                  <div>
                    <h3>Sales</h3>
                    <p>Mengelola customer, deal, quotation, dan follow-up tanpa akses ke invoice atau pembayaran.</p>
                    <span className="lp-scope">Peluang & percakapan customer</span>
                  </div>
                </div>
                <div className="lp-role-row">
                  <span className="lp-role-icon">
                    <Icon name="wallet" />
                  </span>
                  <div>
                    <h3>Finance</h3>
                    <p>Melihat deal Menang, menerbitkan invoice, dan mencatat pembayaran.</p>
                    <span className="lp-scope">Tagihan & penerimaan pembayaran</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="lp-section lp-pricing-section" id="harga">
            <div className="lp-container">
              <div className="lp-center-intro">
                <p className="lp-eyebrow">Paket sesuai ukuran tim</p>
                <h2>Ruang untuk mulai.<br />Ruang untuk bertumbuh.</h2>
                <p>Satu alur inti di setiap paket. Pilih kapasitas anggota yang sesuai dengan cara tim Anda bekerja.</p>
              </div>
              <div className="lp-pricing-note">
                <Icon name="info" />
                <span><b>Usulan paket untuk pratinjau.</b> Harga dan kapasitas berikut belum final dan belum tersedia untuk pembelian.</span>
              </div>
              <div className="lp-pricing-grid">
                <article className="lp-plan">
                  <div className="lp-plan-top">
                    <h3>Starter</h3>
                  </div>
                  <p className="lp-plan-desc">Untuk pemilik bisnis dan tim penjualan kecil.</p>
                  <div className="lp-price">Rp249.000<small> / bulan</small></div>
                  <p className="lp-price-meta">Per perusahaan · hingga 3 anggota</p>
                  <span className="lp-btn lp-secondary lp-btn-soon" aria-disabled="true">Segera tersedia</span>
                  <ul className="lp-checklist">
                    <li>
                      <Icon name="check" />
                      <span>Customer & pipeline deal</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Quotation, revisi & PDF</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Follow-up & composer WhatsApp</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Invoice & pencatatan pembayaran</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Role Owner, Admin, Sales & Finance</span>
                    </li>
                  </ul>
                </article>
                <article className="lp-plan lp-featured">
                  <div className="lp-plan-top">
                    <h3>Growth</h3>
                    <span className="lp-plan-tag">Kolaborasi lintas peran</span>
                  </div>
                  <p className="lp-plan-desc">Untuk tim yang mulai membagi peran sales dan finance.</p>
                  <div className="lp-price">Rp499.000<small> / bulan</small></div>
                  <p className="lp-price-meta">Per perusahaan · hingga 10 anggota</p>
                  <span className="lp-btn lp-primary lp-btn-soon" aria-disabled="true">Segera tersedia</span>
                  <ul className="lp-checklist">
                    <li>
                      <Icon name="check" />
                      <span>Customer & pipeline deal</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Quotation, revisi & PDF</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Follow-up & composer WhatsApp</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Invoice & pencatatan pembayaran</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Role Owner, Admin, Sales & Finance</span>
                    </li>
                  </ul>
                </article>
                <article className="lp-plan">
                  <div className="lp-plan-top">
                    <h3>Scale</h3>
                  </div>
                  <p className="lp-plan-desc">Untuk lebih banyak anggota dalam satu perusahaan.</p>
                  <div className="lp-price">Rp999.000<small> / bulan</small></div>
                  <p className="lp-price-meta">Per perusahaan · hingga 25 anggota</p>
                  <span className="lp-btn lp-secondary lp-btn-soon" aria-disabled="true">Segera tersedia</span>
                  <ul className="lp-checklist">
                    <li>
                      <Icon name="check" />
                      <span>Customer & pipeline deal</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Quotation, revisi & PDF</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Follow-up & composer WhatsApp</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Invoice & pencatatan pembayaran</span>
                    </li>
                    <li>
                      <Icon name="check" />
                      <span>Role Owner, Admin, Sales & Finance</span>
                    </li>
                  </ul>
                </article>
              </div>
              <p className="lp-pricing-footer">Nominal adalah simulasi bulanan. Pajak, ketentuan penagihan, dan batas penggunaan akan ditetapkan pada harga resmi.</p>
            </div>
          </section>
          <section className="lp-section lp-container" id="faq">
            <div className="lp-faq-layout">
              <div className="lp-faq-copy">
                <p className="lp-eyebrow">Sebelum mulai</p>
                <h2>Yang sering<br />ingin ditanyakan.</h2>
                <p>Kenali cara kerja DealFlow dan lihat apakah alurnya sesuai untuk bisnis Anda.</p>
              </div>
              <div className="lp-faq-list">
                <details open>
                  <summary>
                    <span>DealFlow cocok untuk bisnis seperti apa?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>DealFlow dirancang untuk bisnis B2B yang mengelola peluang melalui quotation dan follow-up: vendor CCTV, networking, agency, kontraktor, dan event vendor. Alurnya tetap, sehingga tim tidak perlu mengatur pipeline dari awal.</p>
                </details>
                <details>
                  <summary>
                    <span>Apakah WhatsApp dikirim otomatis?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Tidak. DealFlow menyiapkan pesan yang bisa Anda edit lalu membuka WhatsApp. Anda tetap mengirim pesan sendiri. Membuka WhatsApp tidak otomatis mengubah status quotation atau menandai follow-up selesai.</p>
                </details>
                <details>
                  <summary>
                    <span>Apa bedanya deal Menang dan pembayaran diterima?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Deal Menang berarti kesepakatan sudah dikunci. Setelah itu, Owner, Admin, atau Finance dapat membuat invoice. Uang masuk baru tercatat ketika pembayaran dicatat pada invoice tersebut.</p>
                </details>
                <details>
                  <summary>
                    <span>Bisa mencatat pembayaran sebagian?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Bisa. Setiap pembayaran mengurangi sisa tagihan. Invoice dapat berstatus Belum dibayar, Dibayar sebagian, Lunas, atau Lewat jatuh tempo, sehingga tim tetap dapat melihat tagihan yang perlu ditindaklanjuti.</p>
                </details>
                <details>
                  <summary>
                    <span>Apakah satu akun bisa berpindah perusahaan?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Satu akun hanya aktif di satu organisasi. Owner membuat organisasi, lalu anggota lainnya bergabung melalui undangan. DealFlow tidak menggunakan pemilih multi-organisasi.</p>
                </details>
                <details>
                  <summary>
                    <span>Apakah harga di halaman ini sudah berlaku?</span>
                    <Icon name="plus" />
                  </summary>
                  <p>Belum. Bagian pricing ini adalah usulan untuk membantu meninjau penawaran paket. Harga, kapasitas anggota, pajak, dan ketentuan langganan harus ditetapkan sebelum penjualan dibuka.</p>
                </details>
              </div>
            </div>
          </section>
          <section className="lp-final-cta">
            <div className="lp-container lp-cta-box">
              <div>
                <p className="lp-eyebrow">Peluang berikutnya, lebih tertata</p>
                <h2>Bangun percakapannya.<br />Jaga sampai jadi pembayaran.</h2>
                <p>Mulai dari satu customer. Lanjutkan dalam satu alur.</p>
              </div>
              <a className="lp-btn lp-primary" href="#cara-kerja">Lihat cara kerjanya<Icon name="arrowRight" /></a>
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
    </div>
  );
}
