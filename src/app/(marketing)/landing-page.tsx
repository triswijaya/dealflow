import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BookOpenText, ChatsCircle, Check, FilePdf, FileXls, Plus, UsersThree } from "@phosphor-icons/react/ssr";
import { BrandMark } from "@/components/brand";
import { FAQ, HERO_FACTS, HISTORY, PLAN_INCLUDES, PLANS, ROLES, SCATTERED, STEPS, TOUR } from "./content";
import { LandingNav } from "./landing-nav";
import { ProductTour } from "./product-tour";
import dashboard from "./screens/dashboard.webp";
import { TaglineReveal } from "./tagline-reveal";

const SCATTERED_ICON = { chat: ChatsCircle, sheet: FileXls, pdf: FilePdf, book: BookOpenText } as const;
const delay = (step: number) => ({ "--d": step }) as CSSProperties;

// Document numbers and rupiah amounts inside a sentence are set in the mono face.
const FIGURE = /(QT-\d{4}-\d{5}|PO\/[A-Z]+\/\d{4}\/\d{4}|Rp[\d.]+)/;
function withFigures(text: string) {
  return text.split(FIGURE).map((part, index) =>
    index % 2 ? (
      <span key={index} className="lp-num">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Label({ children }: { children: string }) {
  return (
    <p className="lp-label t-label">
      <i aria-hidden="true" />
      {children}
    </p>
  );
}

/** The blurred streaks of signal behind the hero and closing panels. */
function Light({ low = false }: { low?: boolean }) {
  return (
    <div className={low ? "lp-light lp-light-low" : "lp-light"} aria-hidden="true">
      <i />
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip t-label" href="#konten">
        Lewati ke konten
      </a>
      <LandingNav />

      <main id="konten">
        {/* Hero: one promise, one primary action, and the real product rising out of the panel. */}
        <section className="lp-hero" id="beranda" aria-labelledby="hero-title">
          <div className="lp-hero-panel lp-on-dark" data-lp-dark>
            <Light />
            <div className="lp-wrap">
              <div className="lp-hero-copy">
                <div className="lp-enter">
                  <Label>Untuk tim sales dan finance B2B di Indonesia</Label>
                  <h1 id="hero-title" className="lp-hero-title t-hero">
                    Dari chat pertama <br />
                    sampai uang masuk.
                  </h1>
                </div>
                <p className="lp-hero-lead t-lead lp-enter" style={delay(1)}>
                  Pipeline, penawaran, termin, invoice, dan pembayaran di satu ruang kerja. Sales tahu siapa yang dihubungi hari ini. Finance tahu siapa yang belum bayar.
                </p>
                <div className="lp-hero-cta lp-enter" style={delay(2)}>
                  <div className="lp-actions">
                    <Link className="lp-btn lp-btn-signal" href="/register">
                      Buat ruang kerja
                    </Link>
                    <a className="lp-btn lp-btn-ghost-dark" href="#produk">
                      Lihat produknya
                    </a>
                  </div>
                  <ul className="lp-facts t-label" aria-label="Dibuat untuk cara kerja bisnis Indonesia">
                    {HERO_FACTS.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="lp-hero-stage lp-enter" style={delay(3)}>
                <div className="lp-hero-chips" aria-hidden="true">
                  <p className="lp-chip t-label">
                    Termin DP 30% <span className="lp-num">Rp26.250.000</span>
                  </p>
                  <p className="lp-chip t-label">
                    Dibayar sebagian <span className="lp-num">33%</span>
                  </p>
                </div>
                <figure className="lp-window lp-window-dark">
                  <Image
                    src={dashboard}
                    alt="Ringkasan DealFlow untuk Owner: nilai pipeline aktif Rp361 jt, menang bulan ini Rp66 jt, tagihan belum lunas Rp90 jt, dan grafik pipeline 30 hari terakhir."
                    sizes="(max-width: 1200px) 100vw, 1152px"
                    loading="eager"
                    fetchPriority="high"
                    placeholder="blur"
                  />
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* Problem: the four places a deal lives today, beside the one history it gets. */}
        <section className="lp-section" id="masalah" aria-labelledby="masalah-title">
          <div className="lp-wrap lp-split lp-problem">
            <div>
              <Label>Sebelum</Label>
              <h2 id="masalah-title" className="t-heading">
                Satu deal hari ini tersebar di empat tempat.
              </h2>
              <p className="lp-problem-lead t-body">Chat di WhatsApp, angka di spreadsheet, penawaran di folder, tagihan di buku finance. Tidak ada yang melihat gambaran utuhnya sampai ada yang terlewat.</p>
              <ul className="lp-files">
                {SCATTERED.map((item) => {
                  const Icon = SCATTERED_ICON[item.icon];
                  return (
                    <li key={item.name}>
                      <Icon aria-hidden="true" size={20} />
                      <span>
                        <span className="lp-file-name t-body">{item.name}</span>
                        <span className="t-small lp-muted">{item.meta}</span>
                      </span>
                      <span className="lp-file-pain t-small lp-muted">{item.pain}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <Label>Di DealFlow</Label>
              <h3 className="t-display">Satu deal, satu riwayat, dilihat sales dan finance bersama.</h3>
              <div className="lp-history">
                <p className="lp-history-deal t-label">Paket CCTV hotel 32 kamera · Hotel Mega Kencana</p>
                <ol>
                  {HISTORY.map((event) => (
                    <li key={event.what}>
                      <time className="lp-num t-small">{event.when}</time>
                      <i aria-hidden="true" />
                      <span>
                        <span className="t-body">{withFigures(event.what)}</span>
                        <span className="lp-history-who t-small lp-muted">{event.who}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Product tour: five screens of the real app, one open at a time. */}
        <section className="lp-section" id="produk" aria-labelledby="produk-title">
          <div className="lp-wrap">
            <header className="lp-head lp-split">
              <h2 id="produk-title" className="t-heading">
                Lima layar, satu alur sampai lunas.
              </h2>
              <p className="t-lead lp-muted lp-measure">Semua yang Anda lihat di bawah adalah tampilan asli DealFlow dengan data contoh perusahaan fiktif.</p>
            </header>
            <ProductTour />
          </div>
        </section>

        {/* The tagline, said once in large type, lit word by word. */}
        <section className="lp-section lp-statement" aria-labelledby="tagline">
          <div className="lp-wrap">
            <TaglineReveal id="tagline" text="Deal yang menang belum tentu dibayar. DealFlow mengawal setiap termin sampai lunas." />
          </div>
        </section>

        {/* Roles: the real menus each role sees, taken from the app. */}
        <section className="lp-section lp-panel-section" id="peran" aria-labelledby="peran-title">
          <div className="lp-panel lp-on-dark" data-lp-dark>
            <div className="lp-panel-inner">
              <header className="lp-head lp-split">
                <h2 id="peran-title" className="t-display">
                  Satu data, akses sesuai peran.
                </h2>
                <p className="t-lead lp-muted lp-measure">Sales menutup deal, finance menagih, owner melihat semuanya. Menu di bawah persis seperti yang tampil di aplikasi untuk setiap peran.</p>
              </header>
              <div className="lp-roles">
                {ROLES.map((role) => (
                  <article key={role.name} className="lp-role">
                    <div className="lp-role-text">
                      <h3 className="t-title">{role.name}</h3>
                      <p className="t-body">{role.lead}</p>
                    </div>
                    <div className="lp-role-menus t-small">
                      <p>Menu yang terlihat</p>
                      <ul>
                        {role.menus.map((menu) => (
                          <li key={menu}>{menu}</li>
                        ))}
                      </ul>
                      {role.hidden.length ? (
                        <>
                          <p>Tidak terlihat</p>
                          <ul className="lp-role-hidden">
                            {role.hidden.map((menu) => (
                              <li key={menu}>{menu}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How to start: three steps, each with what its screen asks for. */}
        <section className="lp-section" id="cara-kerja" aria-labelledby="cara-title">
          <div className="lp-wrap">
            <header className="lp-head lp-split">
              <h2 id="cara-title" className="t-heading">
                Tiga langkah sampai deal pertama tercatat.
              </h2>
            </header>
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="lp-step">
                  <span className="lp-step-num lp-num" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <h3 className="t-title">{step.title}</h3>
                  <p className="t-body">{step.body}</p>
                  <StepSample index={index} />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing: proposed plans, labelled as such. */}
        <section className="lp-section" id="harga" aria-labelledby="harga-title">
          <div className="lp-wrap">
            <header className="lp-head lp-split">
              <h2 id="harga-title" className="t-heading">
                Bayar per perusahaan, bukan per orang.
              </h2>
              <div className="lp-head-side">
                <p className="t-lead lp-muted lp-measure">Semua paket berisi alur yang sama. Yang berbeda hanya jumlah anggota tim.</p>
                <p className="lp-chip lp-chip-tile t-label">Usulan harga untuk ditinjau. Belum dijual.</p>
              </div>
            </header>
            <div className="lp-plans">
              {PLANS.map((plan) => (
                <article key={plan.name} className={plan.featured ? "lp-plan lp-plan-featured" : "lp-plan"}>
                  <div className="lp-plan-top">
                    <h3 className="t-title">{plan.name}</h3>
                    {plan.featured ? <span className="lp-chip lp-chip-ink t-label">Disarankan</span> : null}
                  </div>
                  <p className="lp-price lp-num">
                    <span className="t-lead">Rp</span>
                    <b>{plan.price.replace(/^Rp/, "")}</b>
                    <span className="t-small">/ bulan</span>
                  </p>
                  <p className="lp-plan-lead t-body">{plan.lead}</p>
                  <p className="lp-plan-seats t-body">
                    <UsersThree aria-hidden="true" size={20} />
                    Hingga {plan.seats} anggota
                  </p>
                  <Link className={plan.featured ? "lp-btn lp-btn-ink" : "lp-btn lp-btn-ghost-light"} href="/register">
                    Buat ruang kerja
                  </Link>
                </article>
              ))}
            </div>
            <div className="lp-includes lp-split">
              <h3 className="t-title">Semua paket termasuk</h3>
              <ul>
                {PLAN_INCLUDES.map((item) => (
                  <li key={item} className="t-body">
                    <Check aria-hidden="true" size={16} weight="bold" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ: objections answered in plain words. */}
        <section className="lp-section" id="faq" aria-labelledby="faq-title">
          <div className="lp-wrap lp-split">
            <header className="lp-faq-head">
              <h2 id="faq-title" className="t-heading">
                Pertanyaan yang biasanya muncul.
              </h2>
              <p className="t-body lp-muted">Belum terjawab? Buat ruang kerja, masukkan satu customer, dan lihat alurnya sendiri.</p>
            </header>
            <div className="lp-faq-list">
              {FAQ.map((item, index) => (
                <details key={item.q} name="faq" open={index === 0}>
                  <summary>
                    {item.q}
                    <Plus aria-hidden="true" size={20} />
                  </summary>
                  <p className="t-body">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action, the same promise as the hero. */}
        <section className="lp-section lp-panel-section" id="mulai" aria-labelledby="mulai-title">
          <div className="lp-panel lp-on-dark" data-lp-dark>
            <Light low />
            <div className="lp-panel-inner lp-closing">
              <h2 id="mulai-title" className="t-display">
                Mulai dari satu customer. <br />
                Lihat sendiri alurnya.
              </h2>
              <p className="t-lead">Buat ruang kerja, undang tim, lalu catat deal pertama Anda. Tanpa kartu kredit.</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-signal" href="/register">
                  Buat ruang kerja
                </Link>
                <Link className="lp-btn lp-btn-ghost-dark" href="/login">
                  Sudah punya akun? Masuk
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-inner">
            <div className="lp-split">
              <div className="lp-footer-brand">
                <a className="lp-brand" href="#beranda" aria-label="DealFlow, kembali ke atas">
                  <BrandMark />
                  <span>dealflow</span>
                </a>
                <p className="t-body">Ruang kerja penjualan untuk bisnis B2B. Dari chat pertama sampai pembayaran terakhir.</p>
              </div>
              <nav className="lp-footer-cols" aria-label="Tautan footer">
                <div>
                  <h3 className="t-label">Produk</h3>
                  <ul>
                    {TOUR.map((item) => (
                      <li key={item.key}>
                        <a href={`#fitur-${item.key}`}>{item.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="t-label">Jelajahi</h3>
                  <ul>
                    <li>
                      <a href="#peran">Peran dan akses</a>
                    </li>
                    <li>
                      <a href="#cara-kerja">Cara mulai</a>
                    </li>
                    <li>
                      <a href="#harga">Harga</a>
                    </li>
                    <li>
                      <a href="#faq">FAQ</a>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="t-label">Akun</h3>
                  <ul>
                    <li>
                      <Link href="/register">Buat ruang kerja</Link>
                    </li>
                    <li>
                      <Link href="/login">Masuk</Link>
                    </li>
                    <li>
                      <Link href="/forgot-password">Lupa password</Link>
                    </li>
                  </ul>
                </div>
              </nav>
            </div>
            <div className="lp-footer-bottom t-small">
              <span>© 2026 DealFlow</span>
              <span>Dibuat untuk bisnis B2B Indonesia</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A small, static picture of what each step's screen asks for. */
function StepSample({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="lp-sample" aria-hidden="true">
        <span className="lp-sample-label t-small">Nama perusahaan</span>
        <span className="lp-sample-field t-body">
          <span>CV Sinar Teknik Mandiri</span>
          <i />
        </span>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="lp-sample" aria-hidden="true">
        <span className="lp-sample-label t-small">Undang anggota</span>
        <span className="lp-sample-row">
          <span className="lp-sample-field t-body">
            <span>rina@sinarteknik.co.id</span>
          </span>
          <span className="lp-chip lp-chip-outline t-label">Sales</span>
        </span>
      </div>
    );
  }
  return (
    <div className="lp-sample" aria-hidden="true">
      <span className="lp-sample-label t-small">Gali kebutuhan</span>
      <span className="lp-sample-deal">
        <span className="t-small lp-muted">PT Lintas Gudang Sejahtera</span>
        <b className="t-body">Instalasi CCTV gudang</b>
        <span className="lp-num t-body">Rp42.750.000</span>
      </span>
    </div>
  );
}
