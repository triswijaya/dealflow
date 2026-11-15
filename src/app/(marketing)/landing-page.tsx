import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, BookOpenText, ChatsCircle, Check, FilePdf, FileXls, Minus, Plus, UsersThree } from "@phosphor-icons/react/ssr";
import { BrandMark } from "@/components/brand";
import { FAQ, HERO_FACTS, HISTORY, PLAN_INCLUDES, PLANS, ROLES, SCATTERED, STEPS, TOUR } from "./content";
import { LandingEffects } from "./landing-effects";
import { LandingNav } from "./landing-nav";
import { ProductTour } from "./product-tour";
import dashboard from "./screens/dashboard.webp";
import { TaglineReveal } from "./tagline-reveal";

const SCATTERED_ICON = { chat: ChatsCircle, sheet: FileXls, pdf: FilePdf, book: BookOpenText } as const;
const delay = (step: number) => ({ "--d": step }) as CSSProperties;

function Kicker({ children, tone = "light" }: { children: string; tone?: "light" | "dark" }) {
  return <p className={`lp-kicker lp-kicker-${tone} caption-1`}>{children}</p>;
}

export function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip button-sm" href="#konten">
        Lewati ke konten
      </a>
      <LandingNav />

      <main id="konten">
        {/* Hero: one promise, one primary action, and the real product under it. */}
        <section className="lp-hero" id="beranda" aria-labelledby="hero-title">
          <div className="lp-container lp-hero-head">
            <p className="lp-chip caption-1 lp-enter">
              <i aria-hidden="true" />
              Untuk tim sales dan finance B2B di Indonesia
            </p>
            <h1 id="hero-title" className="lp-hero-title heading-1 lp-enter" style={delay(1)}>
              Dari chat pertama <br />
              sampai uang masuk.
            </h1>
            <p className="lp-hero-sub body-7 lp-enter" style={delay(2)}>
              Pipeline, penawaran, termin, invoice, dan pembayaran di satu ruang kerja. Sales tahu siapa yang dihubungi hari ini. Finance tahu siapa yang belum bayar.
            </p>
            <div className="lp-actions lp-enter" style={delay(3)}>
              <Link className="lp-btn lp-btn-light button-md" href="/register">
                Buat ruang kerja
                <ArrowRight aria-hidden="true" size={16} weight="bold" />
              </Link>
              <a className="lp-btn lp-btn-ghost-dark button-md" href="#produk">
                Lihat produknya
              </a>
            </div>
            <ul className="lp-facts caption-4 lp-enter" style={delay(4)} aria-label="Dibuat untuk cara kerja bisnis Indonesia">
              {HERO_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <div className="lp-container">
            <div className="lp-hero-visual">
              <figure className="lp-window">
                <div className="lp-window-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <b className="caption-5">dealflow.tristantowijaya.com/dashboard</b>
                </div>
                <div className="lp-shot">
                  <Image
                    src={dashboard}
                    alt="Ringkasan DealFlow untuk Owner: nilai pipeline aktif Rp361 jt, menang bulan ini Rp66 jt, tagihan belum lunas Rp90 jt, dan grafik pipeline 30 hari terakhir."
                    sizes="(max-width: 1200px) 100vw, 1152px"
                    loading="eager"
                    fetchPriority="high"
                    placeholder="blur"
                  />
                </div>
              </figure>

              <div className="lp-float lp-float-a" aria-hidden="true">
                <p className="caption-5 lp-muted">SO-2026-00007 · Hotel Mega Kencana</p>
                <p className="title-4">Termin DP 30%</p>
                <div className="lp-float-row">
                  <span className="lp-badge lp-badge-warn caption-4">Siap ditagih</span>
                  <b className="lp-mono body-4">Rp26.250.000</b>
                </div>
              </div>
              <div className="lp-float lp-float-b" aria-hidden="true">
                <p className="caption-5 lp-muted">INV-2026-00002 · Klinik Sehat Sentosa</p>
                <div className="lp-float-row">
                  <p className="title-4">Dibayar sebagian</p>
                  <b className="lp-mono caption-3">33%</b>
                </div>
                <span className="lp-meter">
                  <i style={{ transform: "scaleX(0.33)" }} />
                </span>
                <p className="caption-5 lp-muted">
                  Sisa <span className="lp-mono">Rp20.000.000</span> · jatuh tempo 23 Nov
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Problem to solution: the four places a deal lives today, then the one history it gets. */}
        <section className="lp-section" id="masalah" aria-labelledby="masalah-title">
          <div className="lp-container">
            <header className="lp-head lp-reveal">
              <Kicker>Masalahnya</Kicker>
              <h2 id="masalah-title" className="heading-2">
                <span className="lp-dim">Satu deal hari ini</span> tersebar di empat tempat.
              </h2>
              <p className="body-7 lp-lead">Chat di WhatsApp, angka di spreadsheet, penawaran di folder, tagihan di buku finance. Tidak ada yang melihat gambaran utuhnya sampai ada yang terlewat.</p>
            </header>

            <div className="lp-compare">
              <article className="lp-card lp-card-sunken lp-reveal">
                <h3 className="title-3">Sebelum</h3>
                <ul className="lp-files">
                  {SCATTERED.map((item) => {
                    const Icon = SCATTERED_ICON[item.icon];
                    return (
                      <li key={item.name}>
                        <span className="lp-file-icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <span className="lp-file-text">
                          <span className="title-4">{item.name}</span>
                          <span className="caption-5 lp-muted">{item.meta}</span>
                        </span>
                        <span className="lp-badge lp-badge-risk caption-4">{item.pain}</span>
                      </li>
                    );
                  })}
                </ul>
              </article>

              <span className="lp-compare-arrow" aria-hidden="true">
                <ArrowRight size={20} />
              </span>

              <article className="lp-card lp-reveal" style={delay(1)}>
                <h3 className="title-3">Di DealFlow</h3>
                <p className="caption-2 lp-muted">Paket CCTV hotel 32 kamera · Hotel Mega Kencana</p>
                <ol className="lp-history">
                  {HISTORY.map((event) => (
                    <li key={event.what}>
                      <span className="title-4">{event.what}</span>
                      <span className="caption-5 lp-muted">
                        {event.who} · {event.when}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="lp-card-foot caption-1">Satu deal, satu riwayat, dilihat sales dan finance bersama.</p>
              </article>
            </div>
          </div>
        </section>

        {/* Product tour: five screens of the real app, one open at a time. */}
        <section className="lp-section lp-sunken" id="produk" aria-labelledby="produk-title">
          <div className="lp-container">
            <header className="lp-head lp-reveal">
              <Kicker>Produknya</Kicker>
              <h2 id="produk-title" className="heading-2">
                <span className="lp-dim">Lima layar,</span> satu alur sampai lunas.
              </h2>
              <p className="body-7 lp-lead">Semua yang Anda lihat di bawah adalah tampilan asli DealFlow dengan data contoh perusahaan fiktif.</p>
            </header>
            <div className="lp-reveal">
              <ProductTour />
            </div>
          </div>
        </section>

        {/* The tagline, said once in large type, lit word by word. */}
        <section className="lp-section lp-statement" aria-labelledby="tagline">
          <div className="lp-container">
            <TaglineReveal id="tagline" text="Deal yang menang belum tentu dibayar. DealFlow mengawal setiap termin sampai lunas." />
          </div>
        </section>

        {/* Roles: the real menus each role sees, taken from the app. */}
        <section className="lp-section lp-dark" id="peran" aria-labelledby="peran-title">
          <div className="lp-container">
            <header className="lp-head lp-reveal">
              <Kicker tone="dark">Untuk seluruh tim</Kicker>
              <h2 id="peran-title" className="heading-2">
                <span className="lp-dim">Satu data,</span> akses sesuai peran.
              </h2>
              <p className="body-7 lp-lead">Sales menutup deal, finance menagih, owner melihat semuanya. Menu di bawah persis seperti yang tampil di aplikasi untuk setiap peran.</p>
            </header>
            <div className="lp-roles">
              {ROLES.map((role, index) => (
                <article key={role.name} className="lp-role lp-reveal" style={delay(index)}>
                  <h3 className="heading-6">{role.name}</h3>
                  <p className="body-6 lp-muted">{role.lead}</p>
                  <p className="caption-3 lp-role-label">Menu yang terlihat</p>
                  <ul className="lp-chips">
                    {role.menus.map((menu) => (
                      <li key={menu} className="caption-4">
                        <Check aria-hidden="true" size={12} weight="bold" />
                        {menu}
                      </li>
                    ))}
                  </ul>
                  {role.hidden.length ? (
                    <>
                      <p className="caption-3 lp-role-label">Tidak terlihat</p>
                      <ul className="lp-chips lp-chips-off">
                        {role.hidden.map((menu) => (
                          <li key={menu} className="caption-4">
                            <Minus aria-hidden="true" size={12} weight="bold" />
                            {menu}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works: three steps, each with what the screen asks for. */}
        <section className="lp-section" id="cara-kerja" aria-labelledby="cara-title">
          <div className="lp-container">
            <header className="lp-head lp-reveal">
              <Kicker>Cara mulai</Kicker>
              <h2 id="cara-title" className="heading-2">
                <span className="lp-dim">Tiga langkah</span> sampai deal pertama tercatat.
              </h2>
            </header>
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="lp-step lp-reveal" style={delay(index)}>
                  <span className="lp-step-num lp-mono caption-3">0{index + 1}</span>
                  <h3 className="heading-6">{step.title}</h3>
                  <p className="body-6 lp-muted">{step.body}</p>
                  <StepSample index={index} />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing: proposed plans, labelled as such. */}
        <section className="lp-section lp-sunken" id="harga" aria-labelledby="harga-title">
          <div className="lp-container">
            <header className="lp-head lp-head-center lp-reveal">
              <Kicker>Harga</Kicker>
              <h2 id="harga-title" className="heading-2">
                <span className="lp-dim">Bayar per perusahaan,</span> bukan per orang.
              </h2>
              <p className="body-7 lp-lead">Semua paket berisi alur yang sama. Yang berbeda hanya jumlah anggota tim.</p>
              <p className="lp-badge lp-badge-info caption-4">Usulan harga untuk ditinjau. Belum dijual.</p>
            </header>
            <div className="lp-plans">
              {PLANS.map((plan, index) => (
                <article key={plan.name} className={plan.featured ? "lp-plan lp-plan-featured lp-reveal" : "lp-plan lp-reveal"} style={delay(index)}>
                  <div className="lp-plan-top">
                    <h3 className="title-1">{plan.name}</h3>
                    {plan.featured ? <span className="lp-badge lp-badge-on-dark caption-4">Disarankan</span> : null}
                  </div>
                  <p className="body-6 lp-muted">{plan.lead}</p>
                  <p className="lp-price">
                    <span className="heading-4 lp-mono">{plan.price}</span>
                    <span className="caption-2 lp-muted">/ bulan</span>
                  </p>
                  <p className="lp-plan-seats body-5">
                    <UsersThree aria-hidden="true" size={18} />
                    Hingga {plan.seats} anggota
                  </p>
                </article>
              ))}
            </div>
            <div className="lp-includes lp-reveal">
              <h3 className="title-3">Semua paket termasuk</h3>
              <ul>
                {PLAN_INCLUDES.map((item) => (
                  <li key={item} className="body-6">
                    <Check aria-hidden="true" size={16} weight="bold" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link className="lp-btn lp-btn-dark button-md" href="/register">
                Coba tanpa kartu kredit
                <ArrowRight aria-hidden="true" size={16} weight="bold" />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ: objections answered in plain words. */}
        <section className="lp-section" id="faq" aria-labelledby="faq-title">
          <div className="lp-container lp-faq">
            <header className="lp-head lp-reveal">
              <Kicker>FAQ</Kicker>
              <h2 id="faq-title" className="heading-3">
                Pertanyaan yang biasanya muncul.
              </h2>
              <p className="body-3 lp-muted">Belum terjawab? Buat ruang kerja, masukkan satu customer, dan lihat alurnya sendiri.</p>
            </header>
            <div className="lp-faq-list lp-reveal" style={delay(1)}>
              {FAQ.map((item, index) => (
                <details key={item.q} name="faq" open={index === 0}>
                  <summary className="title-3">
                    {item.q}
                    <Plus aria-hidden="true" size={18} />
                  </summary>
                  <p className="body-3 lp-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action, the same promise as the hero. */}
        <section className="lp-final" id="mulai" aria-labelledby="mulai-title">
          <div className="lp-container">
            <div className="lp-final-card lp-reveal">
              <h2 id="mulai-title" className="heading-2">
                Mulai dari satu customer. <br />
                Lihat sendiri alurnya.
              </h2>
              <p className="body-7">Buat ruang kerja, undang tim, lalu catat deal pertama Anda. Tanpa kartu kredit.</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-light button-md" href="/register">
                  Buat ruang kerja
                  <ArrowRight aria-hidden="true" size={16} weight="bold" />
                </Link>
                <Link className="lp-btn lp-btn-ghost-dark button-md" href="/login">
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
              <a className="lp-brand lp-brand-dark" href="#beranda" aria-label="DealFlow, kembali ke atas">
                <BrandMark />
                <span>dealflow</span>
              </a>
              <p className="body-6 lp-muted">Ruang kerja penjualan untuk bisnis B2B. Dari chat pertama sampai pembayaran terakhir.</p>
            </div>
            <nav className="lp-footer-cols" aria-label="Tautan footer">
              <div>
                <h3 className="title-4">Produk</h3>
                <ul>
                  {TOUR.map((item) => (
                    <li key={item.key}>
                      <a className="body-6" href={`#fitur-${item.key}`}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="title-4">Jelajahi</h3>
                <ul>
                  <li>
                    <a className="body-6" href="#peran">
                      Peran dan akses
                    </a>
                  </li>
                  <li>
                    <a className="body-6" href="#cara-kerja">
                      Cara mulai
                    </a>
                  </li>
                  <li>
                    <a className="body-6" href="#harga">
                      Harga
                    </a>
                  </li>
                  <li>
                    <a className="body-6" href="#faq">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="title-4">Akun</h3>
                <ul>
                  <li>
                    <Link className="body-6" href="/register">
                      Buat ruang kerja
                    </Link>
                  </li>
                  <li>
                    <Link className="body-6" href="/login">
                      Masuk
                    </Link>
                  </li>
                  <li>
                    <Link className="body-6" href="/forgot-password">
                      Lupa password
                    </Link>
                  </li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="lp-footer-bottom caption-4 lp-mono">
            <span>© 2026 DEALFLOW</span>
            <span>DIBUAT UNTUK BISNIS B2B INDONESIA</span>
          </div>
        </div>
      </footer>

      <div className="lp-sticky" aria-hidden="true">
        <Link className="lp-btn lp-btn-light button-md" href="/register" tabIndex={-1}>
          Buat ruang kerja
          <ArrowRight aria-hidden="true" size={16} weight="bold" />
        </Link>
      </div>
      <LandingEffects />
    </div>
  );
}

/** A small, static picture of what each step's screen asks for. */
function StepSample({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="lp-sample" aria-hidden="true">
        <span className="caption-4 lp-muted">Nama perusahaan</span>
        <span className="lp-sample-input body-6">
          CV Sinar Teknik Mandiri
          <i />
        </span>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="lp-sample" aria-hidden="true">
        <span className="caption-4 lp-muted">Undang anggota</span>
        <span className="lp-sample-row">
          <span className="lp-sample-input body-6">rina@sinarteknik.co.id</span>
          <span className="lp-badge lp-badge-neutral caption-4">Sales</span>
        </span>
      </div>
    );
  }
  return (
    <div className="lp-sample" aria-hidden="true">
      <span className="caption-4 lp-muted">Gali kebutuhan</span>
      <span className="lp-sample-deal">
        <span className="caption-5 lp-muted">PT Lintas Gudang Sejahtera</span>
        <span className="title-4">Instalasi CCTV gudang</span>
        <span className="body-4 lp-mono">Rp42.750.000</span>
      </span>
    </div>
  );
}
