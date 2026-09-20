# DealFlow: Final Product & Engineering Requirements

Versi: 1.1 · Tanggal: 20 September 2026 (revisi terakhir dari 1.0, 14 September 2026; lihat §23 untuk ringkasan perubahan) · Bahasa produk MVP: Bahasa Indonesia

Status: baseline requirement untuk implementasi dan release MVP. Dokumen ini menetapkan apa yang harus dibangun; dokumen ini bukan laporan bahwa aplikasi sudah dibangun atau diuji.

## 1. Otoritas dokumen dan cara membaca

Dokumen ini menjadi **single source of truth** untuk product scope, business rules, desain database, implementasi, AI coding assistant, automated testing, dan deployment DealFlow.

Dasarnya adalah seluruh 47 bagian PRD asal DealFlow, disatukan dengan keputusan stack final pada §4 dan keputusan penjelas pada §3. Matriks pada §22 memetakan seluruh bagian PRD asal.

- **MUST / wajib:** acceptance requirement; kegagalannya menghalangi release sesuai milestone.
- **SHOULD / dianjurkan:** bernilai tetapi boleh ditunda dengan alasan tercatat; tidak otomatis menjadi blocker MVP.
- **MAY / opsional:** dikerjakan hanya setelah core flow stabil.
- ID seperti `DEAL-01` dan `PAY-03` harus dipakai pada task, test, dan review agar perubahan dapat ditelusuri.
- Aturan bisnis asal dipertahankan. Keputusan tambahan untuk menutup ambiguitas dicatat di §3; keputusan itu adalah baseline implementasi, bukan klaim bahwa PRD asal sudah menentukan detail tersebut.
- Jika implementasi atau README berbeda, perbaiki implementasi/README atau ubah requirement secara eksplisit. Jangan mengubah aturan bisnis diam-diam agar cocok dengan kode.
- Perubahan arsitektur, workflow, role, precision uang, atau scope membutuhkan catatan keputusan arsitektur (ADR), alasan, dampak data, dan pembaruan test yang terkait.

## 2. Produk, tujuan, dan batas MVP

### 2.1 Masalah dan nilai bisnis

DealFlow adalah aplikasi **sales-to-cash** untuk bisnis B2B yang masih mengelola calon customer, quotation, follow-up, invoice, dan pembayaran melalui WhatsApp, spreadsheet, dan dokumen terpisah.

```text
Customer → Lead / Deal → Quotation → Follow-up / Negotiation
                                             ├→ LOST
                                             └→ WON → Invoice → Payment
```

User harus dapat mengetahui calon customer, deal yang berjalan, nilai deal, quotation yang dikirim, jadwal follow-up, hasil WON/LOST, invoice belum lunas, dan uang outstanding dalam satu aplikasi. Visibility utama: **Lead → Deal → Quotation → Revenue**.

Target pengguna: IT/networking vendor, CCTV installer, digital agency, software house, printing & signage, kontraktor, interior contractor, event vendor, equipment rental, distributor, maintenance service, dan business service provider B2B kecil hingga menengah.

### 2.2 Cakupan wajib

MVP mencakup register/login/logout, organisasi terisolasi, tiga kelompok role, customer, deal dan pipeline, quotation dengan banyak item, PDF quotation, revisi, WhatsApp deep-link, pencatatan dan pengingat follow-up di dashboard, WON/LOST, invoice, pembayaran manual termasuk partial payment, overdue, dashboard bisnis, activity timeline, pencarian/filter, responsive UI, automated tests, seeded demo, dokumentasi, dan live deployment.

**SaaS-ready** berarti aplikasi aman digunakan oleh beberapa organisasi melalui satu deployment dengan onboarding, otorisasi, monitoring, backup, dan proses release yang jelas. Subscription billing, paket harga, trial berbayar, metering, dan payment gateway bukan syarat MVP.

### 2.3 Di luar MVP

Jangan menambahkan inventory, accounting ledger, payroll, HRIS, POS, tax reporting, bank reconciliation, payment gateway, WhatsApp Business API, email automation platform, complex workflow builder, AI chatbot, MCP server, native mobile app, marketplace, multi-currency, multi-language, atau complex approval workflow ke MVP.

**Microservices, Redis, Kafka, Kubernetes, dan Elasticsearch secara eksplisit di luar MVP.** Backend NestJS/Express terpisah, message broker, BullMQ, event bus terdistribusi, dan sistem search terpisah juga tidak diperlukan. Penambahan kelak harus menjawab kebutuhan terukur melalui ADR, termasuk alternatif sederhana, biaya operasi, failure mode, dan rencana migrasi. Jumlah fitur atau nilai portfolio bukan alasan teknis yang cukup.

Drag-and-drop pipeline, Money at Risk, dan PDF invoice adalah peningkatan opsional. PDF quotation tetap wajib. Reminder MVP dihitung saat membaca data; tidak membutuhkan queue atau background worker.

### 2.4 Prinsip produk

1. **Business value before feature count:** fitur membantu mendapatkan, menjaga, atau menagih revenue.
2. **Workflow over CRUD:** optimalkan perpindahan customer sampai payment, bukan sekadar kumpulan form.
3. **Simple before automated:** WhatsApp deep-link dan pencatatan manual cukup untuk core flow.
4. **Human review for AI:** jika AI ditambahkan setelah MVP, keluarannya berupa draft yang direview manusia sebelum disimpan.
5. **Production-minded:** integritas, keamanan, test, dan operasional diperlakukan seperti software untuk customer nyata.

## 3. Keputusan penjelas untuk implementasi

PRD asal belum menetapkan semua detail berikut. Default ini dipilih agar implementasi dan test mempunyai hasil deterministik.

| Topik | Baseline final |
|---|---|
| Mata uang | Hanya IDR; unit pencatatan aplikasi Rp1, tanpa pecahan rupiah. Ini pilihan precision produk, bukan pernyataan tentang standar mata uang internasional. |
| Bahasa dan waktu | UI Bahasa Indonesia; timezone organisasi `Asia/Jakarta` untuk MVP; instant disimpan UTC, tanggal bisnis disimpan sebagai `date`. |
| Organisasi | Setiap user hanya memiliki satu membership organisasi aktif pada MVP; organization switcher dan keanggotaan multi-organisasi ditunda. |
| Role | Tiga kelompok bisnis: Owner/Admin, Sales, Finance. Nilai teknis `OWNER` dan `ADMIN` boleh dibedakan untuk melindungi owner terakhir; tidak menambah kelompok operasional baru. |
| Visibilitas Sales | Sales bekerja kolaboratif pada customer, deal, quotation, dan follow-up dalam organisasinya. `assigned_to` adalah penanggung jawab/filter, bukan batas tenant atau aturan own-record-only. |
| Visibilitas Finance | Customer dapat dibaca; detail deal hanya jika WON; quotation hanya yang terkait WON untuk sumber invoice; invoice dan payment seluruh organisasi dapat dibaca. |
| Transisi deal | Alur maju berurutan; LOST dari semua status aktif. QUOTATION adalah tahap pipeline, bukan kewajiban memiliki dokumen quotation. WON tetap mungkin tanpa quotation. |
| Nilai WON | `estimated_value` harus lebih besar dari nol; nilai pada saat WON dibekukan sebagai `won_value` dan tanggalnya sebagai `won_at`. |
| Invoice per deal | Satu invoice per deal pada MVP, mengikuti model Deal → Invoice pada PRD. Split/milestone invoicing ditunda. |
| Perubahan customer deal | Customer deal dapat diganti selama aktif dan belum mempunyai quotation; setelah dokumen terkait ada, hubungan customer dikunci. Perubahan informasi master customer tetap diperbolehkan. |
| Discount dan tax | Nominal rupiah tingkat dokumen, default nol. Input persentase, pajak per item, dan diskon bertingkat ditunda. |
| Quantity | Positif, maksimal tiga angka desimal; nominal unit price tetap integer rupiah. Pembulatan dijelaskan di §13. |
| Overpayment | Pembayaran baru melebihi outstanding ditolak; formula PAID menggunakan `paid_amount >= total` sebagai pertahanan untuk data legacy/import kelak. |
| Dokumen final | Quotation terkirim dan versi yang sudah direvisi immutable untuk konten komersial; invoice tersimpan langsung menjadi dokumen issued dan immutable. |
| Koreksi finansial | Tidak ada edit/delete payment, credit note, refund, atau void invoice pada MVP. UI memberi review sebelum konfirmasi; koreksi insiden mengikuti prosedur terbatas di §18. |
| Pengiriman | SENT dicatat manual setelah user mengirim quotation di luar aplikasi. Membuka WhatsApp atau mengunduh PDF bukan bukti pengiriman. |
| Account service | Email verifikasi, recovery password, dan undangan organisasi adalah fungsi akun untuk production readiness; tidak memperluas scope menjadi email automation bisnis. |

## 4. Stack produksi yang ditetapkan

| Layer | Pilihan wajib / keputusan |
|---|---|
| Bahasa | TypeScript, strict mode, end-to-end |
| Framework | **Next.js 16**, App Router |
| UI runtime | React pada versi stabil yang didukung oleh patch Next.js 16 yang dipilih |
| Server runtime | **Node.js 24 LTS** untuk lokal, CI, build, dan fungsi produksi |
| Package manager | **pnpm**, versi dikunci di `packageManager` dan lockfile di-commit |
| Styling dan UI | **Tailwind CSS + shadcn/ui**; komponen reusable dan accessible |
| Backend | Next.js Server Actions dan Route Handlers dalam aplikasi yang sama |
| Database | **PostgreSQL**, satu database relational dengan tenant key |
| ORM dan migrasi | **Drizzle ORM + Drizzle Kit**, migrasi SQL versioned |
| Driver PostgreSQL | `postgres` / postgres.js sebagai default; konfigurasi pool harus cocok dengan provider |
| Authentication | **Better Auth**, email/password, database session, Drizzle adapter |
| Organization identity | Better Auth organization plugin; satu sumber membership dan mapping role aplikasi |
| Authorization | Permission policy aplikasi pada server, ditambah pemeriksaan membership dan tenant |
| Validasi | **Zod** pada boundary input dan konfigurasi environment |
| Data fetching | Server Components secara default; client state untuk interaksi. TanStack Query hanya jika ada kebutuhan yang tercatat. |
| PDF quotation | `@react-pdf/renderer`, dibuat pada server Node; spike kompatibilitas dilakukan sebelum template difinalkan |
| Unit/integration tests | **Vitest**; integration memakai PostgreSQL nyata yang terisolasi |
| Browser E2E | **Playwright** |
| Logging | Structured logging melalui Pino dengan redaction |
| Error monitoring | **Sentry** untuk client dan server, environment/release tagging |
| Hosting | **Vercel** |
| Managed database | **Supabase Postgres**, atau managed PostgreSQL setara seperti Neon melalui ADR |
| CI/CD | **GitHub Actions + Vercel**, release gate tidak boleh dilewati |
| Local development | **Docker Compose** untuk PostgreSQL; Next.js dapat berjalan langsung pada Node 24 |

`TECH-01`: Kunci patch dependency yang kompatibel dalam lockfile. Jangan menggunakan tag `latest` yang berubah pada pipeline. Baseline major Next.js tetap 16 dan Node tetap 24; upgrade major merupakan keputusan eksplisit. Versi major PostgreSQL lokal/CI harus sama dengan managed database yang dipilih, dan dicatat sebelum scaffold database.

`TECH-02`: Supabase dipakai sebagai PostgreSQL. Better Auth tetap menangani autentikasi. Jangan menambahkan Supabase Auth sebagai sistem autentikasi kedua atau membuat browser mengakses tabel bisnis melalui Supabase Data API.

`TECH-03`: Konfigurasikan Node `24.x` secara eksplisit pada `engines.node` dan pengaturan Vercel, bukan rentang terbuka seperti `>=24`. Vercel mendokumentasikan dukungan Node 24.x; periksa kembali pilihan runtime saat release. [Dokumentasi Vercel Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 5. Arsitektur modular monolith

### 5.1 Struktur dan alur request

```text
Browser: React + Tailwind + shadcn/ui
                 │ HTTPS
                 ▼
Vercel: satu aplikasi Next.js 16 / Node.js 24
  Server Components / Server Actions / Route Handlers
                 ↓
  Session → Membership → Permission → Zod validation
                 ↓
  Domain services / business rules / transaction boundaries
                 ↓
  Tenant-scoped repositories → Drizzle → PostgreSQL
                 │
                 └→ structured logs / Sentry (data disensor)
```

`ARCH-01`: Satu repository aplikasi, satu deployable modular monolith, satu PostgreSQL. Modul berbagi deployment tetapi mempunyai batas tanggung jawab yang jelas.

```text
src/
  app/                    # routes, layouts, thin actions/handlers
  components/             # shared UI dan komponen shadcn
  server/
    auth/                  # Better Auth, organization plugin, session, membership, permission
    customers/
    deals/
    quotations/
    follow-ups/
    whatsapp/
    invoices/              # invoice dan payment (satu modul finance, bukan dua terpisah)
    money/                 # amount/quantity/calculation, dipakai bersama quotation dan invoice
    pdf/                   # rendering quotation PDF
    shared/                # clock organisasi, snapshot builder, contract item dokumen bersama
    db/                    # client, schema, tenant context
    email/                 # adapter email akun
  lib/                     # auth-permissions dan pure shared utilities lain
drizzle/                   # reviewed migrations
tests/                     # integration fixtures dan E2E
docs/adr/                  # keputusan arsitektur
```

Struktur di atas diperbarui 20 September 2026 mengikuti implementasi nyata: setiap modul bisnis hidup langsung di bawah `server/`, bukan pada `modules/` terpisah seperti draft awal. Aturan substansinya (ARCH-02) tidak berubah -- ini murni koreksi lokasi folder, bukan keputusan arsitektur baru. `dashboard/` dan `activities/` sengaja tidak dicantumkan karena keduanya belum dibangun sebagai modul (M4); tambahkan mengikuti pola yang sama begitu ditulis.

Di dalam modul, pisahkan schema validasi, domain/service, repository, type/DTO, komponen UI, dan tests. Nama file dapat mengikuti konvensi repository, tetapi business logic tidak boleh terkumpul di page atau route handler.

`ARCH-02`: Service memegang aturan transaksi, money, status transition, permission bisnis, dan event audit. Repository hanya menjalankan persistence yang sudah memiliki tenant context. Mutasi lintas modul dilakukan melalui service eksplisit, misalnya invoice creation dan payment recording.

`ARCH-03`: Server Components membaca melalui service/data access layer langsung; tidak perlu memanggil HTTP API aplikasinya sendiri. Server Actions untuk form internal; Route Handlers untuk auth, download PDF, dan endpoint yang memang membutuhkan HTTP. Jangan menduplikasi aturan pada kedua transport. Default data authenticated dinamis. Jika caching ditambahkan, key harus memuat tenant dan permission scope, serta invalidasi sesudah commit. Refresh dashboard setelah mutasi berhasil. Pemeriksaan di layout/proxy hanya membantu navigasi; setiap server entry point tetap memeriksa akses. [Panduan autentikasi Next.js](https://nextjs.org/docs/app/guides/authentication).

`ARCH-04`: Modul database, auth, secrets, dan rendering PDF diberi boundary server-only. Client Component menerima DTO minimum, tanpa credential database, hash password, token internal, atau baris auth lengkap.

`ARCH-05`: Tidak ada shared cache lintas tenant untuk data privat.

`ARCH-06`: Hindari ketergantungan pada state proses, file lokal persisten, timer di memory, atau pekerjaan yang dilanjutkan setelah response. Database adalah state durable; reminder dan overdue dihitung dari data saat dibaca. PDF dapat dirender on-demand tanpa object storage MVP.

## 6. Authentication, organization, dan authorization

### 6.1 Account dan onboarding

`AUTH-01`: User dapat register dengan nama, email, password, dan nama perusahaan; login menggunakan email/password; logout mengakhiri session. Better Auth menangani hashing password dan session, bukan implementasi kriptografi sendiri.

`AUTH-02`: Registrasi owner membuat user, organisasi, settings default, dan membership `OWNER` secara aman dan idempotent. Jika provisioning terhenti, akun masuk ke onboarding yang dapat dilanjutkan; jangan mengizinkan akses bisnis sebelum membership lengkap. Email user harus unik sesuai normalisasi provider auth.

`AUTH-03`: Production publik harus menyediakan verifikasi email dan recovery password dengan token kedaluwarsa, sekali pakai, rate limit, dan respons yang tidak membocorkan keberadaan akun. Password tidak dikirim lewat email atau log. Development menggunakan email sink/transport aman; secret email produksi tidak diperlukan untuk menjalankan unit tests.

Reset password berhasil wajib mencabut seluruh session lama. Aktifkan konfigurasi versi terkunci yang setara dengan `revokeSessionsOnPasswordReset: true`, dan buktikan session lama ditolak setelah reset. [Better Auth password reset dan session revocation](https://better-auth.com/docs/authentication/email-password#revoking-sessions-on-password-reset).

`AUTH-04`: Owner/Admin dapat mengundang Sales/Finance/Admin melalui email, melihat daftar anggota, mengubah role yang diizinkan, mencabut undangan, dan menonaktifkan akses. Undangan memiliki expiry dan penerimaan idempotent. Role dan organization berasal dari undangan server, bukan pilihan bebas penerima.

`AUTH-05`: User dengan membership aktif tidak dapat menerima organisasi kedua pada MVP. Constraint dan transaksi harus mencegah dua acceptance paralel melewati aturan ini. Jangan mengaitkan akun dengan organisasi hanya karena domain email sama.

`AUTH-06`: Cookie session menggunakan HttpOnly, Secure di produksi, dan SameSite yang sesuai; session divalidasi pada server. Role change, deactivation, dan logout harus efektif tanpa menunggu cache role yang panjang. User nonaktif tidak dapat login/menjalankan operasi bisnis; event historisnya tetap memiliki atribusi.

### 6.2 Permission matrix

Semua izin berikut terbatas pada organisasi user. `Tidak` berarti ditolak pada server, walaupun request dikirim manual.

| Aksi | Owner/Admin | Sales | Finance |
|---|---|---|---|
| Membaca customer | Ya | Ya | Ya |
| Membuat/mengubah customer | Ya | Ya | Tidak |
| Membaca deal/pipeline | Semua | Semua | Hanya deal WON |
| Membuat/mengubah deal aktif | Ya | Ya | Tidak |
| Mengubah status, WON/LOST | Ya | Ya | Tidak |
| Menetapkan/mengubah assigned sales | Ya | Saat membuat: diri sendiri; setelah itu Tidak | Tidak |
| Membuat/mengubah quotation draft, revisi, status, PDF | Ya | Ya | Tidak |
| Membaca quotation/PDF sebagai sumber invoice | Ya | Ya | Hanya terkait deal WON |
| Membuat/mengubah/menyelesaikan follow-up | Ya | Ya | Tidak |
| Membuka WhatsApp customer | Ya | Ya | Ya, pada customer yang dapat dibaca |
| Membuat/membaca invoice | Ya | Tidak | Ya |
| Mencatat/membaca payment | Ya | Tidak | Ya |
| Dashboard perusahaan lengkap | Ya | Tidak | Tidak |
| Dashboard sales: pipeline, won, follow-up | Ya | Ya | Tidak |
| Dashboard finance: outstanding, overdue | Ya | Tidak | Ya |
| Mengelola settings dan user | Ya, dengan batas owner | Tidak | Tidak |
| Melihat activity timeline | Semua | Event sales | Event finance dan konteks WON |

`RBAC-01`: Default deny. Permission bernama jelas, misalnya `customer.write`, `deal.transition`, `quotation.revise`, `invoice.create`, `payment.record`, `member.manage`. Role adalah bundle permission; jangan menyebarkan kondisi role ad hoc di seluruh aplikasi.

`RBAC-02`: Owner tidak dapat dinonaktifkan atau diturunkan jika itu menghapus owner terakhir. Admin tidak dapat mengambil alih/menghapus Owner atau memberikan role Owner. Transfer ownership bukan UI wajib MVP.

`RBAC-03`: Assigned sales harus membership aktif ber-role Sales atau Owner/Admin pada tenant yang sama. Owner/Admin menangani reassignment jika Sales dinonaktifkan. Record dan atribusi historis tidak dihapus.

`RBAC-04`: Setelah WON, user yang memiliki `invoice.create` mendapat action Create Invoice; Sales melihat hasil WON dan keterangan bahwa Finance/Admin dapat membuat invoice. Kewajiban action sesudah WON tidak memberikan izin finance kepada Sales.

### 6.3 Tenant isolation

`TENANT-01`: Semua tabel bisnis memiliki `organization_id NOT NULL`, termasuk child item, follow-up, activity, audit, dan counter penomoran. Tabel internal Better Auth mengikuti schema library; aksesnya dibatasi adapter auth. Business membership menjadi penghubung identity ke organisasi.

`TENANT-02`: Organization aktif ditentukan dari session dan membership valid pada server. Parameter tenant dari URL/body tidak dipercaya tanpa verifikasi membership. Setiap SELECT, UPDATE, DELETE, aggregate, search, PDF, dan export harus memiliki scope tenant.

`TENANT-03`: Relasi customer→deal→quotation→invoice→payment harus konsisten tenant. Gunakan unique `(organization_id, id)` dan composite foreign key untuk hubungan bisnis; verifikasi service tetap wajib. ID global yang sulit ditebak tidak menggantikan authorization.

`TENANT-04`: Akses ID tenant lain menghasilkan not-found tanpa bocoran nama, nomor dokumen, total, atau keberadaan record. Endpoint list tidak boleh membocorkan count tenant lain. Cache, log, dan error response juga harus diuji.

`TENANT-05`: Gunakan satu sumber membership dari Better Auth organization plugin yang dipetakan ke tabel aplikasi; jangan memelihara dua tabel role yang dapat tidak sinkron. Generate/review schema plugin sesuai versi terkunci, termasuk hook untuk aturan satu organisasi. [Better Auth Organization](https://www.better-auth.com/docs/plugins/organization), [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle).

## 7. Customer, deal, dan sales pipeline

### 7.1 Customer

`CUS-01`: Sales dan Owner/Admin dapat membuat serta memperbarui customer dengan field berikut.

| Field | Ketentuan |
|---|---|
| Company / Customer Name | Wajib, trim, 1-200 karakter |
| Contact Person | Wajib, 1-150 karakter |
| Phone / WhatsApp | Wajib; simpan input dan bentuk internasional ternormalisasi |
| Email | Opsional; validasi format jika diisi |
| Address | Opsional, maksimal 2.000 karakter |
| Notes | Opsional, plain text, maksimal 5.000 karakter |

Contoh data: PT Maju Jaya, Budi Santoso, `08123456789`, `budi@example.com`. Nomor Indonesia berawalan `0` dinormalisasi ke `62`; nomor internasional harus mempunyai country code valid. Simpan sebagai string, bukan angka.

`CUS-02`: Halaman customer menampilkan informasi kontak dan daftar deal sesuai role. Satu customer dapat memiliki banyak deal. Nama/nomor sama dapat diberi peringatan duplikasi tetapi tidak ditolak otomatis karena bisa valid secara bisnis.

`CUS-03`: Mengubah customer tidak mengubah snapshot quotation terkirim atau invoice terdahulu. Tidak ada hard delete customer berelasi melalui UI/API MVP. Pengarsipan customer adalah opsional dan tidak boleh menghilangkan histori.

### 7.2 Deal dan informasi wajib

`DEAL-01`: Deal wajib memiliki `id`, `organization_id`, `customer_id`, `title`, `description`, `estimated_value`, `status`, `assigned_to`, `created_by`, `created_at`, dan `updated_at`. Field description tersedia tetapi boleh kosong. Field opsional: `expected_close_date`, `lost_reason` sebelum LOST, dan `notes`.

Tambahkan `won_at`, `won_value`, `lost_at`, `lost_note`, `last_activity_at`, dan `version` untuk laporan, audit, dan concurrent edit. Judul 1-200 karakter; description/notes maksimal 5.000 karakter; estimated value tidak negatif dan wajib positif saat WON.

`DEAL-02`: Deal baru default `NEW`, terhubung ke customer satu tenant dan assigned sales aktif. Contoh: PT Maju Jaya → CCTV Installation - Bekasi → Rp30.000.000 → Andi.

`customer_id` deal aktif hanya dapat diganti sebelum quotation pertama dibuat. Create quotation dan perubahan customer mengunci/memeriksa deal yang sama agar tidak terjadi race. Sesudah quotation ada, user dapat memperbarui master contact customer tetapi tidak memindahkan deal/dokumen ke customer lain melalui edit umum.

### 7.3 Status dan transisi

Status persis: `NEW`, `CONTACTED`, `QUOTATION`, `NEGOTIATION`, `WON`, `LOST`.

| Dari | Ke yang diizinkan | Syarat |
|---|---|---|
| NEW | CONTACTED | Customer dan assigned sales valid |
| CONTACTED | QUOTATION | Tahap penawaran dimulai; dokumen quotation boleh belum ada |
| QUOTATION | NEGOTIATION | User mencatat perpindahan tahap |
| NEGOTIATION | WON | Customer ada, value > 0; quotation tidak wajib |
| NEW / CONTACTED / QUOTATION / NEGOTIATION | LOST | Lost reason wajib |
| WON / LOST | Tidak ada transisi keluar pada MVP | Reopen/deal reversal ditunda |

`DEAL-03`: Server menolak transisi mundur/lompatan yang tidak ada di tabel. Request mengulang status yang sama tidak menghasilkan event baru. UI menyediakan tombol/select tahap yang dapat digunakan tanpa drag-and-drop.

`DEAL-04`: WON menyimpan `won_at` dan `won_value` sekali dalam transaksi yang sama dengan status dan activity. Deal tanpa quotation tetap bisa melalui tahap QUOTATION dan NEGOTIATION lalu WON. Jangan menambahkan syarat quotation ACCEPTED, PDF, atau payment untuk memenangkan deal.

`DEAL-05`: LOST harus memiliki salah satu alasan: `PRICE_TOO_HIGH`, `LOST_TO_COMPETITOR`, `NO_RESPONSE`, `PROJECT_CANCELLED`, `BUDGET_UNAVAILABLE`, `OTHER`. Label ditampilkan dalam Bahasa Indonesia. Catatan tambahan opsional, termasuk untuk OTHER. Simpan `lost_at` dan event alasan.

`DEAL-06`: Setelah terminal, value/customer/assignment historis tidak boleh berubah melalui edit umum; note lanjutan dapat ditambahkan sebagai activity. Pengubahan data historis merupakan koreksi eksplisit yang diaudit, bukan reopen tersembunyi.

`DEAL-07`: Pipeline menampilkan active deals dikelompokkan pada NEW, CONTACTED, QUOTATION, NEGOTIATION, beserta customer, judul, nilai, dan assigned sales. WON/LOST tetap dapat dilihat pada daftar/filter historis. Empty state, loading, pagination, dan error tersedia.

## 8. Quotation, snapshot, revisi, dan PDF

### 8.1 Pembuatan dan field

`QUO-01`: Sales/Owner/Admin dapat membuat quotation dari deal aktif. Quotation selalu terhubung ke organisasi, customer, deal, dan creator. Satu deal dapat memiliki beberapa quotation; satu keluarga revisi memiliki satu versi terbaru.

| Field | Ketentuan |
|---|---|
| quotation_number | Dibuat server; immutable; format §8.2 |
| customer_id, deal_id, created_by | Relasi wajib, tenant konsisten |
| issue_date | Wajib; default tanggal organisasi hari ini |
| valid_until | Wajib; tidak sebelum issue_date |
| items | Minimal satu item valid |
| subtotal, discount, tax, total | Dihitung/divalidasi server sesuai §13 |
| notes, terms | Opsional plain text; masing-masing maksimal 10.000 karakter |
| status | Default DRAFT; aturan §8.3 |
| family_id, revision_number, previous_revision_id | Menelusuri original dan revisi |
| seller_snapshot, customer_snapshot | Informasi perusahaan/contact saat versi difinalkan |
| frozen_at | Timestamp pembekuan konten; berlaku juga untuk draft sumber revisi/invoice |

`QUO-02`: Setiap item memiliki description wajib (maksimal 1.000 karakter), quantity positif, unit wajib (maksimal 50 karakter), unit_price tidak negatif, subtotal hasil server, dan posisi urutan. Contoh unit: pcs, meter, paket, jam. Maksimal 200 item per dokumen sebagai batas MVP; dokumen harus memiliki total > 0.

`QUO-03`: Draft dapat diedit oleh role yang berhak selama masih versi terbaru dan belum menjadi sumber invoice. Pengeditan field komersial memakai optimistic concurrency (`version`) agar update lama tidak menimpa update baru. Payload total dari browser tidak dipercaya.

### 8.2 Nomor dan revisi

`QUO-04`: Nomor original: `QT-YYYY-XXXXX`, contoh `QT-2026-00042`. Revision: `QT-2026-00042-R1`, lalu `-R2`. Nomor unik **dalam satu organisasi**; identitas global internal adalah ID, bukan nomor tampilan. Tahun diambil dari tanggal pembuatan server dalam timezone organisasi, bukan tanggal yang dapat diedit user.

Counter per `(organization_id, document_type, year)` bertambah secara atomik dalam transaksi. Lima digit adalah minimum padding; sesudah 99999 angka melebar tanpa rollover/duplikasi. Nomor yang sudah dipakai tidak digunakan ulang; gaps diperbolehkan. Revisi tetap memakai base number/tahun original.

`QUO-05`: Membuat revisi menghasilkan record dan item snapshot baru, status DRAFT, revision index berurutan, dan link ke versi sebelumnya. Original tidak ditimpa. UI selalu dapat membuka versi lama dan membandingkan nomor/tanggal/totalnya. Revisi dari historical version membuat salinan baru pada keluarga yang sama; satu transaksi mengunci family dan memastikan hanya satu latest version.

`QUO-06`: Saat revisi dibuat, bekukan snapshot lengkap versi sumber jika belum frozen, serta latest draft yang akan menjadi versi lama jika revisi mengambil sumber historical version. Pembekuan masing-masing memakai kontennya sendiri; jangan menyalin isi sumber ke versi lain. Simpan `frozen_at` dan perubahan latest marker dalam transaksi family yang sama. Semua versi lama menjadi read-only untuk konten dan keputusan manual. Jangan menambah enum status SUPERSEDED; tampilkan label metadata "versi lama". Hanya versi terbaru dapat diedit/dikirim/diterima/ditolak, dan pengeditan konten tetap tunduk pada frozen state. Revisi tidak otomatis mengubah status lama menjadi REJECTED.

`QUO-07`: Quotation ACCEPTED atau yang sudah dipakai invoice tetap dapat menjadi sumber revisi **baru**. Status persetujuan dan snapshot versi lama tidak berubah; invoice tetap menunjuk versi sumber semula. Revisi tersebut tidak membuka kembali deal, tidak mengubah won value, dan tidak menerbitkan invoice kedua. Revisi pada deal WON diperbolehkan untuk histori penawaran, dengan keterangan bahwa invoice issued tidak ikut berubah.

### 8.3 Status quotation

Status persis: `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`.

| Dari | Ke | Aturan |
|---|---|---|
| DRAFT | SENT | Versi terbaru, belum kedaluwarsa, field lengkap, deal bukan NEW/LOST |
| SENT | ACCEPTED | Versi terbaru, belum kedaluwarsa; dicatat manual oleh user berwenang |
| SENT | REJECTED | Versi terbaru, dicatat manual |
| SENT | EXPIRED | Tanggal organisasi hari ini > valid_until dan belum ACCEPTED/REJECTED |
| REJECTED / EXPIRED | DRAFT baru | Melalui revisi/new quotation, bukan edit status record lama |
| ACCEPTED | Tidak ada perubahan | Konten dan hasil keputusan final pada MVP |

`QUO-08`: SENT menyimpan `sent_at`; snapshot company/customer/items/terms dan `frozen_at` diisi hanya jika belum frozen. Draft yang sudah dibekukan sebagai source invoice mempertahankan snapshot semula saat SENT. Jika deal masih CONTACTED, aksi SENT juga memindahkan deal ke QUOTATION dalam transaksi yang sama. Pada QUOTATION/NEGOTIATION/WON tahap tidak berubah. Deal NEW harus lebih dahulu dipindahkan ke CONTACTED. Download PDF sendiri tidak mengubah status.

`QUO-09`: ACCEPTED dan REJECTED menyimpan timestamp/actor. ACCEPTED tidak otomatis membuat deal WON; REJECTED/EXPIRED tidak otomatis membuat deal LOST. User tetap mengambil keputusan deal sesuai §7.

`QUO-10`: Expiry menggunakan tanggal organisasi: tepat pada valid_until quotation belum expired. Draft lewat valid_until tetap draft dengan peringatan dan tidak bisa SENT sampai tanggal diperbaiki. Effective status SENT yang lewat batas adalah EXPIRED pada setiap read dan diperiksa kembali di dalam transaksi acceptance. Materialisasi EXPIRED/event boleh dilakukan secara idempotent; cron bukan syarat akurasi.

### 8.4 PDF dan snapshot

`PDF-01`: User berizin dapat men-download PDF quotation yang berisi company information, nomor dan revisi, customer/contact, issue_date, valid_until, semua item, subtotal, discount, tax, grand total, terms, dan notes. Format IDR dan tanggal harus konsisten dengan UI.

`PDF-02`: PDF draft menampilkan penanda DRAFT. Konten komersial semua quotation dengan `frozen_at`, termasuk latest DRAFT yang dipakai invoice, berasal dari snapshot yang dibekukan. Perubahan master customer, harga draft baru, settings organisasi, atau status operasional tidak boleh mengubah konten komersial snapshot lama. Status terkini dapat ditampilkan di UI; penanda draft bukan izin menghitung ulang snapshot frozen.

`PDF-03`: Template harus menangani item panjang, page break, header tabel berulang, font yang dibundel, serta total/terms tanpa terpotong. Nomor dokumen dan nomor halaman tersedia pada dokumen multi-halaman. Logo upload tidak wajib; nama/alamat/kontak perusahaan teks cukup untuk MVP.

`PDF-04`: Endpoint PDF memverifikasi session, tenant, dan permission pada setiap request; tidak ada public predictable URL. Response memakai content type PDF dan filename aman. Tidak mengambil arbitrary URL dari notes/customer input dan tidak membutuhkan penyimpanan file permanen. Target waktu rendering dijelaskan di §17.

## 9. Follow-up dan WhatsApp

`FUP-01`: Sales/Owner/Admin dapat membuat follow-up dengan `deal_id`, `type`, `note`, `follow_up_at`, `completed_at`, dan `created_by`, ditambah tenant dan timestamps. Type: `CALL`, `WHATSAPP`, `EMAIL`, `MEETING`, `OTHER`. Note boleh kosong, maksimal 5.000 karakter; jadwal wajib.

`FUP-02`: User dapat mengubah jadwal/note sebelum selesai, menandai selesai, dan mencatat interaksi yang sudah terjadi dengan `completed_at`. Penyelesaian ulang idempotent. Reschedule menyimpan histori; perubahan waktu tidak menghapus event sebelumnya.

`FUP-03`: Dashboard membagi follow-up belum selesai pada deal aktif menurut tanggal lokal organisasi: **Today** = hari ini, **Overdue** = sebelum hari ini, **Upcoming** = setelah hari ini. Semua bucket mutually exclusive; filter lanjutan dapat menampilkan jam yang sudah lewat hari ini. Completed follow-up dikecualikan.

`FUP-04`: Pada WON/LOST, reminder deal tidak muncul sebagai pekerjaan aktif; record follow-up lama tetap tersedia dan tidak otomatis dianggap completed. Pembuatan reminder sales baru untuk terminal deal ditolak pada MVP.

`WA-01`: Open WhatsApp menghasilkan deep-link ke `https://wa.me/{international_digits}?text={encoded_message}` dari nomor customer yang sudah dinormalisasi. Template default:

```text
Halo Pak/Bu {customer_name},

izin follow-up terkait quotation {quotation_number}
untuk {deal_title}.

Apakah quotation tersebut sudah sempat direview?

Terima kasih.
```

`WA-02`: User dapat mengedit pesan sebelum membuka WhatsApp. Jika quotation belum ada, gunakan template follow-up deal tanpa nomor quotation. Jika ada banyak quotation, default versi terbaru yang relevan dan izinkan user memilih dokumen dalam deal yang sama. Placeholder tidak boleh tertinggal dalam pesan.

`WA-03`: Nomor kosong/tidak valid menghasilkan error yang dapat diperbaiki; message di-URL-encode. Aplikasi hanya membuka WhatsApp, tidak mengirim otomatis, tidak menandai quotation SENT, dan tidak mengklaim delivered/read. Catat follow-up completed hanya saat user mengonfirmasi aktivitas terjadi. Klik deep-link boleh dicatat sebagai event `whatsapp.opened`, dengan makna yang berbeda.

`FUP-05`: Tampilan reminder menampilkan customer/deal, nilai deal, jadwal, last contact jika ada, action Open Deal, dan WhatsApp. "Last contact" berarti interaksi completed, bukan waktu halaman dibuka atau jadwal dibuat.

## 10. Invoice dan payment

### 10.1 Pembuatan invoice

`INV-01`: Finance/Owner/Admin hanya dapat membuat invoice untuk deal WON. `customer_id` wajib sama dengan deal, dan `quotation_id` opsional. Deal tanpa quotation harus tetap bisa dibuat invoice dengan input item manual.

`INV-02`: Jika quotation tersedia, user dapat memilih versi spesifik sebagai source. UI merekomendasikan versi ACCEPTED; jika tidak ada, pilih versi relevan dengan label status dan review eksplisit. Jangan mewajibkan quotation ACCEPTED karena PRD tidak mensyaratkannya. Copy customer snapshot, items, unit price, discount, tax, notes/terms yang relevan; simpan source quotation ID.

`INV-03`: User dapat meninjau/mengubah isi salinan sebelum menerbitkan invoice. Perubahan tidak mengedit quotation. Saat submit, backend menghitung kembali total dan menyimpan snapshot final; sesudah itu invoice/item immutable. Quotation draft yang dipakai invoice dibekukan sebagai source.

Invoice creation mengunci source quotation, memeriksa expected source edit version dari preview, lalu melakukan snapshot/freeze dan version bump dalam transaksi. Quotation edit/revision harus memakai lock/recheck yang kompatibel. Source yang berubah sejak preview menghasilkan conflict untuk review ulang; proses invoice tidak boleh membekukan data sambil edit paralel masih berhasil menimpanya. Snapshot yang sudah frozen tidak dibekukan ulang dari master data terbaru.

| Field invoice | Ketentuan |
|---|---|
| invoice_number | Otomatis `INV-YYYY-XXXXX`, contoh `INV-2026-00001`; policy nomor sama dengan §8.2 |
| organization_id, customer_id, deal_id | Wajib dan tenant konsisten |
| quotation_id | Opsional, versi tertentu dari deal yang sama |
| issue_date, due_date | Wajib; due_date >= issue_date |
| items | Minimal satu, field/precision sama dengan quotation items |
| subtotal, discount, tax, total | Dihitung server; total > 0 |
| notes, terms | Opsional plain text; disalin dari quotation source jika ada (INV-02), dapat diubah user sebelum diterbitkan (INV-03) |
| status | Effective status menurut §10.2 |
| paid_amount, remaining_amount | Nilai turunan: dihitung ulang dari data payment pada setiap read, bukan kolom yang wajib di-cache (lihat §14.1 "cached ... jika dipakai"); bukan input user |
| seller_snapshot, customer_snapshot, currency | Snapshot wajib; currency IDR |
| created_at, updated_at, created_by | Metadata audit |

`INV-04`: Nomor, invoice, items, source reference, dan event `invoice.created` tersimpan dalam satu transaksi. Unique `(organization_id, deal_id)` mencegah dua invoice untuk satu deal. Double-click/retry harus mengembalikan invoice yang sama; source/field tidak boleh diam-diam diganti pada retry.

`INV-05`: Halaman invoice menampilkan customer/deal/source, item, total, paid, remaining, due date, status, dan riwayat payment. Invoice PDF MAY ditambahkan setelah quotation PDF dan core payment lolos.

### 10.2 Status dan saldo invoice

Status tampilan persis: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`.

```text
paid_amount      = sum(payment.amount yang tercatat valid)
remaining_amount = max(invoice.total - paid_amount, 0)

Jika paid_amount >= total:                       PAID
Jika belum lunas dan today_org > due_date:       OVERDUE
Jika 0 < paid_amount < total:                    PARTIALLY_PAID
Selain itu:                                     UNPAID
```

`INV-06`: PAID memiliki prioritas tertinggi. OVERDUE mengalahkan UNPAID/PARTIALLY_PAID sesudah due date; pada due date sendiri belum overdue. Invoice overdue yang baru dibayar sebagian tetap OVERDUE, dengan rincian pembayaran parsial tetap terlihat. Saat lunas langsung PAID.

`INV-07`: Effective status dihitung konsisten saat read/search/filter/dashboard, berdasarkan tanggal organisasi dan payment. Jika status/paid_amount disimpan sebagai cache, transaksi payment memperbaruinya dan read tetap menerapkan expiry tanggal. Kebenaran tidak boleh tergantung cron berjalan tepat tengah malam.

### 10.3 Pencatatan pembayaran manual

`PAY-01`: Finance/Owner/Admin dapat mencatat payment: `invoice_id`, `amount`, `payment_date`, `payment_method`, `reference`, `note`, `created_by`, tenant, dan timestamps. Method: `BANK_TRANSFER`, `CASH`, `OTHER`. Reference/note opsional; panjang maksimum masing-masing 200/5.000 karakter.

`PAY-02`: Amount wajib integer rupiah > 0 dan <= outstanding terkini. Payment date adalah tanggal bisnis, tidak sebelum issue_date dan tidak sesudah hari ini; backdate valid di antaranya. `created_at` tetap waktu pencatatan aktual. Pembayaran pada invoice PAID ditolak.

`PAY-03`: Dalam satu transaksi: validasi akses → lock invoice row → cek replay idempotency → hitung saldo terbaru dan validasi amount baru → insert payment → perbarui aggregate pembayaran jika disimpan → catat activity → commit. Jika salah satu gagal, semuanya rollback. Replay valid mengembalikan hasil awal sebelum pemeriksaan invoice PAID/outstanding; retry pelunasan tidak boleh gagal hanya karena invoice sekarang sudah PAID. Lock dan pemeriksaan saldo harus melindungi dua Finance yang submit bersamaan.

`PAY-04`: Pencatatan payment memiliki idempotency key unik per tenant dan operasi. Key yang sama dengan payload sama mengembalikan hasil awal tanpa duplikasi; key sama dengan payload berbeda menghasilkan conflict. Reference bank bukan satu-satunya deduplication key karena satu transfer dapat mempunyai kebutuhan bisnis berbeda kelak.

`PAY-05`: Form menampilkan invoice, amount, date, method, dan remaining setelah payment untuk review sebelum simpan. Payment tersimpan tidak dapat diedit/dihapus di MVP; tidak ada automatic payment gateway, refund, credit balance, atau bank reconciliation.

Contoh acceptance: invoice Rp30.000.000 → payment Rp10.000.000 → paid Rp10.000.000, remaining Rp20.000.000, PARTIALLY_PAID jika belum lewat due date → payment Rp20.000.000 → remaining Rp0, PAID. Sesudah refresh, dashboard dan detail menunjukkan angka sama.

## 11. Dashboard, activity timeline, dan audit

### 11.1 Metrik bisnis

`DASH-01`: Dashboard mengikuti scope role §6; Owner/Admin mendapat seluruh metrik. Semua jumlah menggunakan satu tenant dan definisi tanggal yang sama.

| Metrik | Definisi yang wajib dipakai |
|---|---|
| Sales Pipeline Value | Sum `estimated_value` dari NEW, CONTACTED, QUOTATION, NEGOTIATION |
| Won Revenue / Won This Month | Sum `won_value` untuk deal dengan `won_at` pada bulan kalender berjalan di timezone organisasi |
| Outstanding Invoice | Sum `remaining_amount` semua invoice belum lunas, termasuk overdue dan partial |
| Follow-up Today | Jumlah customer unik yang memiliki follow-up belum selesai hari ini pada deal aktif; tampilkan jumlah task juga jika berbeda |
| Overdue Invoice | Jumlah invoice belum lunas dengan today_org > due_date, dan sum remaining-nya |

Won Revenue adalah nilai deal yang dimenangkan, bukan cash received atau laporan accounting revenue recognition. Invoice total dapat berbeda dari deal estimate/won value; UI tidak boleh menyamakan ketiganya atau menjumlahkannya sebagai satu metrik.

`DASH-02`: Metrik ter-update sesudah commit customer/deal/quotation/invoice/payment terkait. Gunakan agregasi database yang tidak menggandakan nilai akibat join item/payment. Data kosong ditampilkan sebagai nol dan empty state yang membantu, bukan angka demo di production.

`DASH-03`: Widget menyediakan drill-down ke daftar terfilter dengan scope role yang sama. Perhitungan bulan menggunakan interval half-open awal bulan sampai awal bulan berikutnya dalam timezone organisasi, dikonversi ke UTC untuk `won_at`.

### 11.2 Money at Risk: opsional

`RISK-01`: MAY menampilkan deal aktif dengan last meaningful activity lebih dari tujuh hari lalu: `status NOT IN (WON, LOST)` dan `now - last_activity_at > 7 hari`. Jika belum ada activity, gunakan `created_at`. Tepat tujuh hari belum termasuk. Tampilkan customer/deal, nilai, dan usia inactivity.

Last meaningful activity meliputi follow-up completed, quotation dibuat/dikirim/direvisi/keputusan, dan perubahan tahap deal. Page view, klik WhatsApp tanpa konfirmasi, edit note kosmetik, serta auto-expiry tidak mereset inactivity. Money at Risk bukan acceptance blocker core MVP.

### 11.3 Timeline dan audit

`AUD-01`: Setiap deal memiliki timeline berurutan stabil menurut timestamp dan ID. Event bisnis minimum: customer/deal created, deal updated/stage changed, quotation created/revised/SENT/ACCEPTED/REJECTED, follow-up created/rescheduled/completed, WON, LOST, invoice created, payment recorded. Event memuat actor, timestamp, jenis, entity ID, dan ringkasan aman.

`AUD-02`: Core record mempunyai `created_at`, `updated_at`, `created_by`; tambahkan `updated_by` jika mutable. Event append-only cukup `created_at` dan actor. Event otomatis dapat memiliki actor sistem yang eksplisit. Untuk perubahan penting simpan nilai sebelum/sesudah atau metadata perubahan yang diperlukan, tanpa password/token.

`AUD-03`: Activity bisnis dan mutasi sumber disimpan atomik. Sentry/log aplikasi tidak menggantikan audit data bisnis. Duplicate request tidak boleh menghasilkan dua activity untuk satu aksi yang sama.

`AUD-04`: Histori tidak dapat diedit/dihapus dari UI/API umum. Event finance pada timeline disembunyikan dari Sales sesuai permission; invoice total/payment detail tidak boleh bocor melalui ringkasan, count, atau payload activity. Perubahan role, deactivation, settings, serta koreksi insiden disimpan pada audit organisasi dengan akses Owner/Admin.

## 12. Search, filter, dan pengalaman pengguna

`SEARCH-01`: Pencarian database sederhana mencakup customer name, contact person, phone, deal title, quotation number, dan invoice number. Case-insensitive untuk teks; normalisasi nomor telepon pada pencarian. Search scope selalu tenant dan role.

`SEARCH-02`: Gunakan parameterized search, panjang query maksimal 200 karakter, debounce UI, pagination server (default 25, maksimum 100 per halaman), dan stable sort. Empty query menjadi daftar normal. Jangan memuat seluruh tabel ke browser. PostgreSQL index biasa lebih dulu; trigram hanya jika hasil profiling membutuhkan. Tidak menggunakan Elasticsearch.

`FILTER-01`: Deals: status, assigned sales, customer, created-date range. Invoice: effective status, due-date range, customer. Filter dapat dikombinasikan dan tersimpan pada URL tanpa secrets. Range tanggal inklusif di UI diterjemahkan konsisten untuk tipe date/timestamp; invalid range ditolak.

`UX-01`: Halaman minimum: register/login/recovery/onboarding, dashboard, customer list/detail/form, deal list/pipeline/detail, quotation editor/detail/version history/PDF, follow-up list/form, invoice list/detail/create, payment form/history, settings company, serta member management.

`UX-02`: Navigasi dan action mengikuti role. Setiap halaman data menyediakan loading, empty, error, retry, field validation, dan success state. Error yang dapat diperbaiki mempertahankan input user. Mutation tombol dinonaktifkan saat submit, tetapi server idempotency tetap wajib.

`UX-03`: Desktop, tablet, dan mobile harus usable. Uji viewport minimal 360px, 768px, dan 1440px. Aktivitas mobile utama: check pipeline, membuka customer/deal, mencatat follow-up, dan membuka WhatsApp. Tabel lebar dapat scroll horizontal; header/action utama tetap dapat digunakan. Feature parity sempurna mobile bukan syarat.

`UX-04`: Form memiliki label, pesan error terkait field, navigasi keyboard, focus terlihat, focus management dialog, dan status yang tidak hanya dibedakan warna. Target accessibility WCAG 2.2 AA untuk alur utama; tambahkan pemeriksaan keyboard dan contrast pada QA.

`UX-05`: Angka uang ditampilkan `Rp30.000.000`; input locale diparse menjadi string integer/decimal yang tepat sebelum validasi server. Jangan mengirim formatted string ambigu sebagai nilai persistence. Timestamp ditampilkan sesuai timezone organisasi dan currency/date konsisten antara UI dan PDF.

`UX-06`: Settings minimal memuat company name, alamat, email/phone perusahaan, currency IDR, timezone MVP, serta default quotation terms. Ubah settings tidak mengubah snapshot dokumen lama. Error teknis tidak menampilkan stack trace/SQL kepada user.

## 13. Perhitungan uang, precision, dan invariant

### 13.1 Representasi dan formula

`MONEY-01`: Semua amount menggunakan PostgreSQL `bigint` dalam rupiah bulat. Domain TypeScript memakai `bigint`, bukan JavaScript floating-point sebagai sumber kebenaran. Pada JSON/DTO amount diserialisasi sebagai string integer, misalnya `"12500000"`. Jangan menggunakan mode ORM yang mengubah nominal besar menjadi `number`.

`MONEY-02`: Quantity menggunakan PostgreSQL `numeric(12,3)` dan string decimal dalam kontrak. Domain mengubah quantity menjadi integer berskala 1000 secara exact; jangan memakai `parseFloat` lalu perkalian uang. Input lebih dari tiga desimal ditolak, tidak dipotong diam-diam.

```text
q_scaled             = quantity × 1000, diparse secara exact
item_subtotal        = HALF_UP(q_scaled × unit_price / 1000) ke Rp1
document_subtotal    = sum(item_subtotal)
document_total       = document_subtotal - discount_amount + tax_amount
paid_amount          = sum(payments.amount)
remaining_amount     = max(document_total - paid_amount, 0)
```

`MONEY-03`: Pembulatan HALF_UP dilakukan sekali per item; jumlahkan subtotal item yang sudah dibulatkan. Discount dan tax merupakan nominal integer tingkat dokumen, bukan persen. Invoice hasil copy memakai aturan sama. Backend menyimpan input item, hasil hitung, dan versi aturan kalkulasi `calculation_version = 1` pada snapshot final.

Contoh exact rounding: quantity `0.333` × unit price Rp1.001 = Rp333,333 → subtotal Rp333. Quantity `0.500` × Rp1 = Rp0,5 → Rp1. Dua baris contoh pertama berjumlah Rp666 karena pembulatan per baris, bukan menghitung ulang quantity gabungan.

### 13.2 Batas dan konsistensi

`MONEY-04`: Quantity 0 < q <= 1.000.000,000; unit price 0 sampai Rp1.000.000.000.000.000; subtotal/total/estimated value/amount per record maksimal Rp1.000.000.000.000.000. Hitung dengan BigInt lebih dahulu lalu tolak jika hasil melewati batas. Agregasi dashboard tetap exact dan tidak dikonversi ke number.

`MONEY-05`: `0 <= discount <= subtotal`; `tax >= 0`; quotation/invoice tersimpan harus mempunyai total > 0; semua amount sesuai currency IDR. Item gratis diperbolehkan jika dokumen total positif. Nilai negatif, NaN, Infinity, exponent notation yang tidak didukung, dan precision berlebih ditolak melalui Zod/domain/database constraint yang relevan.

`MONEY-06`: Semua perhitungan invoice/quotation/payment dilakukan ulang atau divalidasi backend. Frontend hanya preview. Database check constraint melindungi nonnegative/range; invariant lintas row seperti jumlah payment memerlukan transaksi dan lock, bukan check constraint biasa.

`MONEY-07`: Saldo payment tidak boleh bergantung pada tampilan UI atau angka yang dikirim client. Calculation helper dipakai bersama oleh quotation, invoice, dan test; snapshot final tidak direcalculate dengan formula baru tanpa migrasi eksplisit.

## 14. Model data dan integritas database

### 14.1 Entity dan relasi

```text
Organization ── Membership ── User (Better Auth identity)
   ├─ Settings
   ├─ Customers ── Deals
   │                ├─ Quotations ── QuotationItems
   │                │     └─ revision family / previous revision
   │                ├─ FollowUps
   │                ├─ Activities
   │                └─ Invoice ── InvoiceItems
   │                       └─ Payments
   ├─ DocumentCounters
   └─ AuditEvents / IdempotencyRecords
```

Nama SQL snake_case dan TypeScript camelCase diperbolehkan. Daftar berikut adalah kontrak logical schema, bukan perintah menyalin schema auth secara manual.

| Tabel logical | Data dan constraint utama |
|---|---|
| `organizations` | ID, name, timestamps, creator; profile/setting dapat dipisahkan |
| `users` dan tabel auth | User, account/password hash, session, verification sesuai schema Better Auth terkunci; jangan simpan plaintext password |
| `memberships` | Organization/user, role, active/deactivated; unique membership pair dan maksimal satu active org/user |
| `invitations` | Organization, email, role, expiry, state, inviter sesuai plugin dan aturan aplikasi |
| `organization_settings` | Unique organization, alamat/contact, currency, timezone, default terms |
| `customers` | Tenant, company name, contact, phone raw/normalized, email/address/notes, audit fields |
| `deals` | Tenant/customer, title, description, estimated value, enum status, assignment, expected close date, lost reason/note, won/lost timestamps, frozen won value, last activity, version, audit fields |
| `quotations` | Tenant/deal/customer, number, family/revision/previous ID, latest marker, dates, status/timestamps, totals, snapshot/frozen_at, calculation version, edit version, audit fields |
| `quotation_items` | Tenant/quotation, description, quantity, unit, unit price, subtotal, sort order |
| `follow_ups` | Tenant/deal, type, note, scheduled/completed timestamps, creator, audit fields |
| `activities` | Tenant/deal, entity/type, actor, timestamp, metadata, permission category, operation ID |
| `invoices` | Tenant/deal/customer/optional quotation, unique number, dates, totals, snapshots, calculation version, cached paid/status jika dipakai, audit fields |
| `invoice_items` | Tenant/invoice, description, quantity, unit, unit price, subtotal, sort order |
| `payments` | Tenant/invoice, amount, date, method, reference, note, creator/timestamps, idempotency key |
| `document_counters` | Unique tenant/type/year, next sequence; jenis quotation original dan invoice terpisah |
| `audit_events` | Tenant, actor/system, event, target, timestamp, redacted change metadata; append-only |
| `idempotency_records` | Tenant/operation/key unique, request fingerprint, result entity ID, timestamps; hasil finansial durable |

`DATA-01`: Gunakan UUID untuk business IDs; auth ID mengikuti dukungan versi library. Semua kolom mandatory memakai NOT NULL. FKs menjaga keberadaan parent dan tenant; index FK/query penting ditambahkan secara eksplisit.

`DATA-02`: Unique constraints minimum: nomor quotation/invoice per tenant, family+revision index, paling banyak satu latest version per family, satu invoice per tenant/deal, item sort order per parent, counter tenant/type/year, dan operation idempotency key. Revision source, quotation source invoice, dan customer harus berasal dari deal yang benar, bukan hanya tenant yang sama.

`DATA-03`: Index minimum mengikuti query: customer name/phone sesuai pola search; deals `(organization_id,status)`, assignment, customer, created_at, won_at; follow-ups tenant+follow_up_at untuk yang belum selesai; quotations tenant+deal/number; invoices tenant+customer/due_date; payments tenant+invoice; activities tenant+deal+created_at. Validasi penggunaan index melalui query plan pada dataset uji sebelum menambah index mahal.

`DATA-04`: Semua instant memakai `timestamptz` UTC; tanggal issue/valid-until/due/payment memakai `date`. Clock service/domain dapat diinjeksi di tests. Jangan memakai timezone komputer browser untuk perhitungan overdue atau bulan revenue.

`DATA-05`: Foreign key deletion untuk record bisnis berelasi menggunakan RESTRICT secara default. Jangan cascade-delete invoice, payment, atau audit saat user/customer dinonaktifkan. Child draft yang belum final dapat diganti dalam transaksi edit; histori final tidak boleh hilang.

`DATA-06`: Transaksi wajib untuk provisioning organisasi/membership, document numbering+create, revision+items+freeze source, SENT+stage update, WON/LOST+activity, invoice+items+source freeze, dan payment+balance+activity. External email/Sentry dilakukan sesudah commit; kegagalan monitoring tidak membatalkan transaksi bisnis yang sudah sah.

`DATA-07`: Concurrent update memakai version check atau row locking yang tepat. Balas conflict dengan instruksi reload/review, bukan overwrite. Deadlock/serialization retry harus terbatas, aman diulang, dan tidak menggandakan event/nomor/payment.

## 15. Kontrak server dan error handling

`API-01`: Setiap operasi melakukan authenticate → resolve membership/tenant → authorize → validate input/reference → execute service/transaction → return DTO minimum. Validasi race-sensitive diulangi di dalam transaksi. Client tidak boleh mengatur `created_by`, computed totals, nomor dokumen, role, atau organization secara bebas.

Kontrak logical berikut wajib tersedia melalui Server Action atau Route Handler; tidak semuanya harus menjadi public REST endpoint.

| Operasi | Input penting | Hasil |
|---|---|---|
| create/update customer | Field customer; ID/version saat update | Customer DTO |
| create/update deal | Customer, title, value, assignment, optional fields | Deal DTO |
| transition deal | Deal ID, expected version, target status, lost reason jika perlu | Deal + status committed |
| create/edit quotation | Deal, dates, lines, nominal discount/tax, notes/terms | Quotation + total server |
| revise quotation | Source version ID, expected family version, idempotency key | New DRAFT version |
| change quotation status | Exact quotation ID, expected version, target status | Quotation + optional deal transition |
| download quotation PDF | Exact version ID | Authorized PDF stream |
| create/update/complete follow-up | Deal, type, schedule, note, version | Follow-up DTO |
| create invoice | WON deal, optional exact quotation ID, dates, reviewed items, idempotency key | Immutable invoice DTO |
| record payment | Invoice, amount string, business date, method, reference/note, idempotency key | Payment + latest invoice balance |
| list/search/dashboard | Validated filters/page/sort | Scoped DTOs + bounded pagination metadata |

`API-02`: Error shape logical: `{ code, message, fieldErrors?, requestId? }`. Untuk HTTP gunakan 400 invalid request, 401 unauthenticated, 403 permission denied pada resource tenant sendiri, 404 missing/cross-tenant, 409 version/idempotency/business-state conflict, 429 rate limited, dan 500 generic unexpected error. Server Actions boleh menggunakan typed result union dengan code yang sama. Jangan mengembalikan stack trace atau internal SQL.

`API-03`: Error field yang diketahui ditampilkan langsung; error unexpected dilaporkan ke Sentry dengan request ID. User memperoleh retry hanya untuk operasi yang aman diulang. Setelah timeout submit payment, UI mempertahankan idempotency key dan dapat memuat hasil invoice sebelum menawarkan submit baru.

`API-04`: Batas request harus eksplisit: maksimal 200 item, panjang teks sesuai modul, pagination maksimum 100, dan body bisnis maksimal 1 MiB. Uploaded files tidak diterima pada MVP. Kebutuhan batas lebih besar harus dibuktikan dengan fixture dan uji rendering/performance.

`API-05`: Semua create action yang rentan retry menggunakan operation key atau unique invariant yang sesuai; khusus invoice/payment/revision wajib idempotent. Identitas unik key adalah `(organization_id, operation_type, idempotency_key)`. Entity ID dan normalized payload fingerprint disimpan sebagai data pembanding, bukan bagian unique key. Reuse key lintas invoice atau payload berbeda ditolak, termasuk pada concurrent requests.

## 16. Security dan privasi

`SEC-01`: Better Auth menggunakan konfigurasi resmi yang sesuai versi terkunci; jangan membuat custom JWT/password/session stack kedua. Password policy baseline 12-128 karakter, tidak ditrim/diubah diam-diam. Lindungi register, login, recovery, resend verification, dan invite acceptance dari brute force/abuse.

`SEC-02`: Rate limit harus bekerja lintas instance Vercel. Gunakan database-backed limiter dengan expiry/cleanup terbatas, ditambah platform protection bila tersedia. In-memory counter saja tidak cukup. Server Actions yang membungkus `auth.api` perlu limiter sendiri karena limiter endpoint Better Auth tidak otomatis melindungi server calls. Redis tetap di luar MVP. [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit).

`SEC-03`: Validasi origin/CSRF pada mutasi berbasis cookie menggunakan mekanisme framework/auth yang sesuai; jangan menonaktifkan trusted-origin checks untuk mengatasi preview. Mutasi bisnis DealFlow tidak boleh melalui GET. Callback akun milik Better Auth, seperti verifikasi email bertoken melalui GET, mengikuti protokol library dengan validasi token dan trusted origin yang sesuai. Preview origin dikonfigurasi secara terbatas dan tidak memperluas trusted origins produksi secara liar. [Implementasi resmi email verification Better Auth](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/email-verification.ts).

`SEC-04`: Semua query melalui Drizzle/parameterized SQL. Input sort/column berasal dari allowlist, bukan string SQL user. Text ditampilkan escaped; raw HTML dari customer/notes/terms tidak dirender. Terapkan security headers dan Content Security Policy yang diuji bersama Next.js dan Sentry.

`SEC-05`: Secrets hanya di environment server/build yang membutuhkan. Database URL, Better Auth secret, email credential, dan Sentry upload token tidak boleh memakai prefix `NEXT_PUBLIC_`, masuk repository, dikirim ke client, atau tampil di error/log. `.env.example` hanya placeholder; file `.env*` berisi secret di-ignore.

`SEC-06`: Gunakan HTTPS dan koneksi PostgreSQL TLS terverifikasi sesuai provider. Runtime DB role least privilege: akses DML yang dibutuhkan tanpa DDL/superuser; migration role terpisah. Nonaktifkan Supabase Data API jika tidak dipakai, atau keluarkan/restrict business schemas dari akses publik. Anon/public role tidak boleh membaca tabel bisnis.

`SEC-07`: Authorization tenant aplikasi selalu wajib. PostgreSQL RLS MAY ditambahkan sebagai pertahanan tambahan; Better Auth session tidak otomatis menjadi Supabase JWT/RLS context. Jika memakai RLS, uji role runtime, owner bypass, dan `SET LOCAL` context per transaksi; jangan mengandalkan session variable yang terbawa antarkoneksi pooler. [Panduan Supabase dengan Drizzle](https://supabase.com/docs/guides/database/drizzle).

`SEC-08`: Log dan monitoring disensor: tidak mencatat password, session/reset token, cookie, connection string, isi PDF, payload customer, atau catatan pembayaran utuh. Request ID, operation, internal tenant/entity ID yang diperlukan, duration, status, dan safe error code cukup. Retensi log/audit serta akses operator didokumentasikan sebelum live production.

`SEC-09`: Uji tenant isolation pada read/write/nested item/source lookup/PDF/search/aggregate dan session yang sudah dicabut. Tidak ada hardcoded bypass role, demo password produksi, hidden superadmin endpoint, atau reliance pada button visibility.

`SEC-10`: Pilih patched dependencies pada major yang ditetapkan; jalankan dependency/secret scanning di CI. Temuan critical/high yang relevan dengan jalur aplikasi harus diperbaiki sebelum release; false positive/exception membutuhkan bukti dan batas waktu, bukan sekadar ignore global.

## 17. Non-functional requirements dan observability

### 17.1 Performance dan usability

`NFR-01`: Target awal PRD: common API request < 500 ms pada dataset demo normal. Definisi pengukuran: p95 server response untuk read/mutation umum setelah warm-up, aplikasi dan DB di region dekat, 10 user concurrent, minimal 100 request per operasi representatif. Catat cold start terpisah; PDF, external email, dan login hashing dilaporkan sebagai operasi khusus, bukan disembunyikan dari laporan.

`NFR-02`: Target interaksi daftar/dashboard terasa responsif: initial useful content <= 2,5 detik pada kondisi broadband uji yang dicatat; feedback submit/loading segera muncul. PDF quotation 20 item selesai <= 5 detik pada preview; fixture 200 item harus berhasil dalam limit memory/duration provider yang dikonfigurasi. Target adalah acceptance yang harus dibuktikan, bukan jaminan sebelum benchmark.

`NFR-03`: Hindari N+1, query tanpa limit, koneksi berlebih per instance, dan join aggregate yang menggandakan nominal. Connection pool, region, index, dan representative query plan dicatat pada dokumentasi performa.

### 17.2 Reliability dan monitoring

`OBS-01`: Pasang Sentry untuk client/server pada preview dan production dengan release identifier commit SHA dan environment. Upload source map melalui credential build-only. Scrub data sensitif sebelum kirim. Pastikan satu error browser dan satu error server uji muncul pada release yang benar, lalu hapus trigger pengujiannya. Ikuti SDK resmi sesuai dependency terkunci. [Sentry Next.js SDK](https://github.com/getsentry/sentry-javascript/tree/develop/packages/nextjs).

`OBS-02`: Structured log minimum: timestamp UTC, level, request ID, operation, duration, safe status/error, dan correlation ID yang diperlukan. Audit finansial tetap di database; kegagalan Sentry tidak boleh menghilangkan payment yang sah.

`OBS-03`: Sediakan health/liveness endpoint tanpa informasi sensitif dan readiness check DB yang dibatasi akses/frekuensinya. Monitoring memberi sinyal untuk elevated 5xx, koneksi DB gagal, auth failure abnormal, dan error create invoice/payment. Alert diarahkan ke operator yang ditentukan pada setup produksi.

`OBS-04`: Runtime tidak boleh memerlukan writable persistent filesystem. External email akun dikirim sesudah commit; jika gagal, user dapat resend dengan rate limit dan tanpa membuat akun/invitation duplikat. Untuk reminder email masa depan, gunakan job/outbox durable PostgreSQL dan pemrosesan bounded hanya saat fitur itu disetujui.

`OBS-05`: Scheduled job bukan dependency MVP. Jika kelak memakai Vercel Cron, endpoint wajib secret-protected, idempotent, aman dari overlap, mempunyai persisted progress dan retry policy. Overdue tetap benar saat cron gagal. [Pengelolaan Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## 18. Local development, CI/CD, dan deployment

### 18.1 Setup yang dapat direproduksi

`DEV-01`: Repository wajib mempunyai `package.json`, `pnpm-lock.yaml`, version pin Node/pnpm, Drizzle config/schema/migrations, `compose.yaml`, `.env.example`, ESLint config, TypeScript config, Vitest/Playwright config, seed script, GitHub Actions workflows, dan README.

`DEV-02`: Docker Compose menjalankan PostgreSQL dengan versi major yang sama dengan production, healthcheck, dan named volume. Docker untuk aplikasi Next.js opsional; aplikasi lokal default berjalan pada Node 24 agar hot reload sederhana. Tidak perlu container orchestration produksi.

README harus menyediakan perintah yang benar-benar diimplementasikan berikut, beserta prerequisite dan troubleshooting port/koneksi:

```sh
pnpm install --frozen-lockfile
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev

pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm start
```

`DEV-03`: Sediakan juga `pnpm db:generate` untuk menghasilkan migrasi dari schema dan `pnpm db:check` untuk validasi migration/schema drift. Seed/reset hanya untuk database local/test/demo yang teridentifikasi; perintah menolak target production. Migrasi fresh DB dan upgrade dari schema sebelumnya diuji.

### 18.2 Environment variables

Nama berikut adalah kontrak konfigurasi aplikasi; jika library memerlukan nama berbeda, mapping harus didokumentasikan dan divalidasi Zod saat startup/build sesuai environment.

| Variable | Scope dan fungsi |
|---|---|
| `DATABASE_URL` | Server runtime; pooled PostgreSQL URL dengan runtime credential |
| `DATABASE_MIGRATION_URL` | Job migrasi saja; direct connection dan credential DDL |
| `BETTER_AUTH_SECRET` | Secret kuat unik per environment |
| `BETTER_AUTH_URL` | Base URL auth yang benar untuk environment |
| `APP_URL` | Canonical app URL untuk link account/invitation |
| `EMAIL_FROM`, `EMAIL_PROVIDER_API_KEY` | Account email adapter; credential server-only; nama provider dipilih sebelum public launch |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | DSN sesuai server/client SDK; DSN client bukan upload credential |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Trusted build/source-map upload; token tidak tersedia di browser |
| `APP_ENV`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | Local/test/demo/preview/production dan commit release |
| `CRON_SECRET` | Hanya jika scheduled job disetujui kemudian |

Jangan menggunakan satu database atau auth secret bersama untuk production dan PR preview. Environment test tidak mengirim email ke customer nyata. Public app URL bukan sumber tenant authorization.

### 18.3 PostgreSQL terkelola dan pooling

`DEPLOY-01`: Default hosting: Vercel + Supabase Postgres, region aplikasi sedekat mungkin dengan region DB. Provider alternatif harus tetap mendukung PostgreSQL, transaksi, migration access, TLS, pooling, backup, dan restore. Hindari API proprietary untuk core persistence agar migrasi provider tetap memungkinkan.

`DEPLOY-02`: Untuk Supabase dari Vercel gunakan transaction pooler pada runtime dan driver postgres.js dengan prepared statements dinonaktifkan (`prepare: false`). Batasi connection pool per instance dan ukur total concurrency terhadap limit provider. Jangan mengandalkan state session atau session-level advisory lock di transaction pooler. [Koneksi PostgreSQL Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL).

`DEPLOY-03`: Migrasi memakai direct connection terpisah. Jika runner tidak dapat menjangkau endpoint direct IPv6, sediakan jalur IPv4 yang didukung atau validasi session pooler untuk tool migrasi yang dipilih. Jangan menjalankan DDL melalui transaction pooler runtime. Migrasi tidak dijalankan setiap request, startup function, atau build preview paralel. [Panduan koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

### 18.4 CI dan release gate

`CI-01`: Setiap PR menjalankan Node 24 + pnpm frozen lockfile install, lint, typecheck, unit tests, PostgreSQL integration tests, migration check, production build, dan E2E kritis. Tests menggunakan DB terisolasi dengan synthetic data. Auth/session async Server Component flow diuji melalui E2E, bukan hanya mock unit.

`CI-02`: Lint adalah langkah ESLint terpisah: Next.js 16 tidak menyediakan `next lint`, dan build bukan pengganti lint. Gunakan API async framework seperti `cookies`, `headers`, `params`, dan `searchParams` sesuai dokumentasi versi terpasang. [Panduan Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16).

`CI-03`: Pipeline mempunyai required checks pada protected main, permission token minimum, action dependency terkunci/reviewed, timeout, dan artifact laporan failure. Untrusted fork PR tidak menerima production/database/email/Sentry-upload secrets. Pisahkan cache/artifact agar secret tidak ikut tersimpan.

`CI-04`: Pull request dapat menghasilkan Vercel preview dengan data nonproduksi. Merge/build success saja tidak mengizinkan production release. Pilih satu jalur release terkontrol melalui GitHub Actions/Vercel yang menunggu seluruh checks, menjalankan satu migration job terserialisasi, lalu deploy/promote commit yang sama. Nonaktifkan atau gate auto-production deployment yang dapat mendahului checks/migrasi.

`CI-05`: Migrasi production versioned, direview, dan backward-compatible melalui pola expand → deploy → contract jika perlu. Backup/restore readiness diperiksa sebelum migration berisiko. Jangan memakai schema push destruktif ke production. Release job memakai concurrency group agar dua migrasi tidak berjalan bersamaan.

`DEPLOY-04`: Sebelum release: verifikasi runtime 24.x, env scope, app/auth origin, region/pool, email verification/recovery, migration status, security settings, monitoring, dan synthetic smoke test login→workflow. Sesudah release cek error rate, DB connection, dan dashboard; catat commit/deployment ID serta hasil smoke test.

### 18.5 Backup, recovery, dan koreksi insiden

`OPS-01`: Pilih plan/provider yang memenuhi backup kebutuhan produksi; jangan mengasumsikan free tier menyediakan retention/PITR tertentu. Target awal yang harus diuji: RPO <= 24 jam, RTO <= 8 jam, retention backup minimal 7 hari. Catat kemampuan aktual plan, jadwal, lokasi, akses, dan operator sebelum menerima data customer nyata.

`OPS-02`: Lakukan restore drill ke database terisolasi sebelum public production, kemudian minimal per kuartal. Verifikasi login, jumlah record, tenant isolation, nomor dokumen, snapshot, dan saldo payment. Jangan menimpa production hanya untuk menguji restore.

`OPS-03`: Runbook rollback membedakan rollback aplikasi dari rollback schema. Vercel rollback tidak membatalkan migrasi DB. Gunakan versi aplikasi yang kompatibel atau forward-fix; destructive restore memerlukan penilaian kehilangan data dan prosedur operator yang terdokumentasi.

`OPS-04`: Jika salah input pada record finansial immutable, hentikan mutasi terkait dan gunakan prosedur koreksi operator yang terbatas: identifikasi record/tenant, simpan bukti before/after, alasan dan pelaksana, backup, script satu kali yang direview dan transactional, lalu rekonsiliasi invoice/payment/dashboard serta audit koreksi. Tidak ada endpoint tersembunyi untuk bypass rule. Workflow correction self-service yang lebih lengkap masuk post-MVP.

## 19. Strategi pengujian dan acceptance scenarios

### 19.1 Lapisan test

`TEST-01`: Vitest menguji pure business rules: money, status, permission, date grouping, validation, dan service behavior. Integration Vitest memakai PostgreSQL nyata untuk FK, tenant scoping, transaction rollback, race, idempotency, dan migrations. Jangan mengganti seluruh repository dengan mock pada pengujian integritas.

`TEST-02`: Playwright menguji UI/browser terhadap production build dengan data deterministik. Async Server Components diuji melalui integrasi/browser; jangan mengklaim unit mock membuktikan rendering server secara utuh. Jalankan Chromium untuk suite kritis setiap PR; smoke utama pada Firefox/WebKit sebelum release. [Next.js dengan Vitest](https://nextjs.org/docs/app/guides/testing/vitest), [Next.js dengan Playwright](https://nextjs.org/docs/app/guides/testing/playwright).

`TEST-03`: Setiap invariant finansial/tenant/status mempunyai kasus positif, negatif, dan boundary. Target coverage numerik dapat dicatat sebagai indikator, tetapi tidak menggantikan skenario berikut. Clock dapat dikontrol untuk midnight, bulan baru, dan expiry; tidak menggunakan sleep panjang yang rapuh.

| Test ID | Skenario dan hasil wajib | Requirement utama |
|---|---|---|
| AT-01 | Register owner, onboarding, verify, login, logout, recovery; akun tanpa membership tidak dapat membuka data bisnis | AUTH-01-06 |
| AT-02 | Create customer dengan field wajib; invalid phone/email dan missing required field ditolak; one customer punya beberapa deal | CUS-01-03, DEAL-01 |
| AT-03 | NEW→CONTACTED→QUOTATION→NEGOTIATION→WON; setiap transisi ilegal ditolak tanpa mutasi | DEAL-03-04 |
| AT-04 | LOST dari masing-masing empat tahap aktif memerlukan alasan; WON/LOST tidak bisa reopen; value nol tidak dapat WON | DEAL-03-06 |
| AT-05 | WON tanpa quotation lalu invoice item manual sampai PAID tetap berhasil | DEAL-04, INV-01, PAY-01-05 |
| AT-06 | Kalkulasi banyak item, quantity pecahan, HALF_UP, free line, nominal discount/tax, batas maksimum; total client palsu diabaikan/ditolak | QUO-02-03, MONEY-01-07 |
| AT-07 | Nomor original/revision/invoice unik pada create concurrent, retry, tenant berbeda, pergantian tahun, dan overflow lima digit | QUO-04-06, INV-04, DATA-02 |
| AT-08 | Revisi SENT/ACCEPTED/invoice-linked menghasilkan record baru; merevisi R0 saat R1 draft terbaru membekukan R1 sebelum membuat R2; perubahan master atau later SENT tidak mengubah snapshot/PDF/invoice frozen | QUO-05-08, PDF-02, INV-03 |
| AT-09 | Download PDF tidak menandai SENT; SENT dari CONTACTED memindahkan tahap atomik; ACCEPTED tidak otomatis WON; expired tidak dapat diterima | QUO-08-10 |
| AT-10 | PDF 1/20/200 item dan deskripsi panjang tidak terpotong; versi/total cocok; tenant lain tidak dapat download | PDF-01-04 |
| AT-11 | WhatsApp nomor ternormalisasi, message editable/encoded, template tanpa quotation, invalid phone; membuka link tidak mencatat delivery/completion | WA-01-03 |
| AT-12 | Reminder Today/Overdue/Upcoming tepat pada midnight; completed/terminal deal tidak muncul aktif; last contact tidak berubah oleh page view | FUP-01-05 |
| AT-13 | Finance membuat invoice hanya dari WON, copy exact source version, tanpa quotation, dan retry mengembalikan invoice sama | INV-01-05 |
| AT-14 | Rp30 juta dibayar Rp10 juta lalu Rp20 juta; status/saldo tepat; amount negatif/nol/overpay/future date ditolak | PAY-01-05, INV-06 |
| AT-15 | Payment final di-retry dengan key sama tetap berhasil sekali; key sama payload berbeda conflict; dua payment concurrent tidak melebihi saldo | PAY-03-04, API-05 |
| AT-16 | Paksa failure sesudah insert payment/sebelum activity; payment, saldo, dan activity semuanya rollback | DATA-06, PAY-03 |
| AT-17 | UNPAID/PARTIALLY_PAID/PAID/OVERDUE sesuai urutan, due today belum overdue, paid late tetap PAID; status/filter benar tanpa cron | INV-06-07 |
| AT-18 | Dashboard pipeline/won-month/outstanding/overdue/customer-count cocok fixture; multiple items/payments tidak menggandakan sum; rollover bulan benar | DASH-01-03 |
| AT-19 | Sales memanggil payment/member endpoint manual ditolak; Finance mencoba active deal/quotation edit ditolak; last owner tidak dapat dihapus | RBAC-01-04 |
| AT-20 | Tenant A mencoba ID tenant B pada list/detail/update/source/item/PDF/search/dashboard/activity: tanpa read leak, write, atau count leak | TENANT-01-05, SEC-09 |
| AT-21 | Session lama setelah role downgrade/deactivation/password reset ditolak; request tanpa session dan CSRF/origin invalid ditolak; tokenized auth callback valid tetap bekerja | AUTH-03/06, SEC-03 |
| AT-22 | Concurrent edit draft/deal dan invoice source freeze tidak menimpa diam-diam; customer deal terkunci setelah quotation; source customer/deal lain ditolak walaupun tenant sama | QUO-03, INV-03, DEAL-02, DATA-02/07 |
| AT-23 | Fresh migrations, upgrade migrations, seed guard, preview config, build, Sentry browser/server smoke, dan restore drill berhasil | DEV-01-03, CI-01-05, OPS-01-03 |
| AT-24 | Mobile 360px: pipeline→customer→follow-up→WhatsApp usable; keyboard form/dialog dan error state berfungsi | UX-01-06 |
| AT-25 | Jika Money at Risk dibuat: >7 hari masuk, tepat 7 hari tidak, WON/LOST tidak; view/link click tidak mereset timer | RISK-01 |

### 19.2 Happy path E2E utama

```text
Login
→ Create Customer
→ Create Deal
→ Move to CONTACTED
→ Create Quotation + Add Items
→ Generate / Download PDF
→ Mark Quotation SENT (deal menjadi QUOTATION jika masih CONTACTED)
→ Create Follow-up
→ Move Deal to NEGOTIATION
→ Mark Deal WON
→ Create Invoice
→ Record Partial Payment
→ Record Final Payment
→ Invoice PAID
→ Verify dashboard + immutable history + activity timeline
```

`TEST-04`: Happy path di atas wajib berjalan dengan Owner/Admin end-to-end. Jalankan juga handoff role: Sales menyelesaikan sisi sales, lalu Finance membuat invoice dan mencatat payment menggunakan session berbeda. Tambahkan satu negative test tenant B untuk memastikan keberhasilan alur tidak bergantung pada bypass authorization.

`TEST-05`: Simpan trace/screenshot/report pada kegagalan browser test tanpa secrets. PDF diuji nilai teks dan dirender untuk inspeksi visual layout; snapshot screenshot saja tidak membuktikan perhitungan/authorization. Tidak ada klaim "tested" jika suite terkait belum dijalankan.

## 20. Demo, tahap implementasi, dan Definition of Done

### 20.1 Seeded live demo

`DEMO-01`: Sediakan live demo terpisah dari production customer. Organisasi utama: **NusaTech Solutions**, industri CCTV, Networking & Office IT. Seed harus terasa seperti bisnis nyata, tanpa `Test User`, `Customer 1`, atau `Lorem Ipsum`.

Seed minimum:

- 20+ customer dengan company/contact/alamat yang masuk akal dan seluruhnya fiktif.
- 10+ active deal tersebar pada NEW/CONTACTED/QUOTATION/NEGOTIATION; tambahkan beberapa WON dan LOST beserta alasan.
- Beberapa quotation: multi-item, SENT, ACCEPTED, REJECTED, EXPIRED, dan keluarga revisi R1/R2.
- Beberapa invoice: UNPAID, PARTIALLY_PAID, PAID, OVERDUE termasuk partial-overdue.
- Payment beberapa method, partial/final, tanpa melewati saldo.
- Follow-up Today, Overdue, Upcoming, completed, dan activity timeline yang konsisten.
- Akun contoh untuk tiga kelompok role dan organisasi kedua untuk demonstrasi isolasi/test.

`DEMO-02`: Tanggal seed relatif terhadap tanggal anchor agar kondisi overdue/current month tetap relevan; mode test menggunakan anchor tetap. Semua nominal dan relasi valid menggunakan domain rules atau fixture builder yang equivalent, tanpa menonaktifkan constraint.

`DEMO-03`: Demo tidak menggunakan PII/credential customer nyata. Email memakai domain contoh; link WhatsApp ditampilkan sebagai preview atau memakai nomor uji yang memang dimiliki pengelola, bukan nomor acak yang mungkin milik orang lain. Email akun demo tidak dikirim ke penerima publik acak.

`DEMO-04`: Shared demo boleh reset secara terkendali pada environment khusus; jangan menghubungkan reset ke production. Credential demo berizin terbatas didokumentasikan di halaman demo; aksi member/email eksternal dapat disimulasikan pada demo, sementara fungsi asli diuji pada preview terkendali.

### 20.2 Tahap pengerjaan yang direkomendasikan

| Tahap | Hasil dan gate |
|---|---|
| M0: Foundation | Stack terkunci, Node24, PostgreSQL Docker, schema/migration, Better Auth/org/role, env, CI, minimal preview build; buktikan adapter auth, driver pooling, dan PDF renderer kompatibel |
| M1: Sales core | Customer, deal, pipeline, transition, tenant isolation, assignment, activity; unit/integration permission dan status lulus |
| M2: Quotation & follow-up | Money helper, numbering, quotation/revision/snapshot/PDF, WhatsApp, reminders; kalkulasi dan PDF/history tests lulus |
| M3: Finance | WON→invoice, payment partial/final, overdue, transaction/idempotency/concurrency; financial tests lulus |
| M4: Visibility & UX | Dashboard, search/filter, responsive/a11y, coherent error/loading/empty states; role handoff E2E lulus |
| M5: Release | Seed demo, security checks, performance sample, monitoring, restore drill, README/screenshots, Vercel live deployment dan smoke test |

Tahap tidak boleh dinyatakan selesai hanya karena UI ter-render. Service/database/permission dan test acceptance terkait harus ikut selesai. Fitur opsional tidak menghalangi core milestones.

### 20.3 MVP Definition of Done

Checklist berikut mempertahankan seluruh DoD PRD asal dan menambahkan release gates teknis. Centang hanya dengan bukti implementasi/hasil test/deployment.

- [ ] User dapat register/login/logout dan menyelesaikan onboarding/recovery yang ditetapkan.
- [ ] Organization memiliki isolated data pada semua jalur server.
- [ ] User berwenang dapat membuat customer.
- [ ] User berwenang dapat membuat dan mengelola deal.
- [ ] Deal memiliki sales pipeline status dan transisi valid.
- [ ] User berwenang dapat membuat quotation dengan multiple items.
- [ ] Total quotation dan invoice dihitung backend secara exact dan benar.
- [ ] Quotation PDF dapat di-download dan layout diverifikasi.
- [ ] Quotation revision membuat snapshot baru, histori lama tetap dapat diakses.
- [ ] Follow-up dapat dibuat, diperbarui, diselesaikan, dan ditampilkan pada reminder.
- [ ] WhatsApp customer dapat dibuka dengan pesan editable.
- [ ] Deal dapat WON atau LOST dengan validasi yang benar; WON tidak mewajibkan quotation.
- [ ] WON deal dapat dikonversi menjadi invoice dengan atau tanpa quotation.
- [ ] Invoice mendukung partial payment dan otomatis PAID ketika lunas.
- [ ] Overdue invoice dikenali secara benar tanpa ketergantungan cron.
- [ ] Dashboard menunjukkan pipeline value, won revenue, outstanding, overdue, dan follow-up sesuai role.
- [ ] Authorization dan membership diperiksa di backend, termasuk akses manual dan revoked session.
- [ ] Activity/audit mencatat aksi penting dan menjaga histori.
- [ ] Critical business logic mempunyai automated unit, integration, dan E2E tests yang lulus.
- [ ] Transaction rollback, duplicate submit, concurrent payment, dan cross-tenant tests lulus.
- [ ] Application berjalan melalui documented setup dengan Docker PostgreSQL, Node24, dan pnpm.
- [ ] Migration, build, lint, typecheck, dependency checks, dan CI release gate lulus.
- [ ] Aplikasi memiliki fictional seeded demo dan live deployment yang dapat digunakan.
- [ ] Sentry client/server, logging redaction, pooling, backup, restore, dan rollback procedure diverifikasi.
- [ ] UI utama usable pada desktop/tablet/mobile dan keyboard.
- [ ] README menjelaskan problem, architecture, stack, setup/env, migration/seed/test, business rules, deployment, demo access, screenshots, tradeoff, dan batas MVP.
- [ ] Tidak ada known blocker finansial, auth, tenant isolation, atau kehilangan data yang dibiarkan tanpa penyelesaian.

### 20.4 Roadmap sesudah MVP

Urutan berikut mempertahankan roadmap asal; tidak menjadi janji tanggal atau dependency MVP.

| Versi | Scope kandidat |
|---|---|
| v1.1: Email & WhatsApp | Quotation email, invoice email, configurable message templates, official WhatsApp integration |
| v1.2: Approval Workflow | Contoh quotation > Rp50 juta membutuhkan persetujuan manager sebelum Sales mengirim |
| v1.3: Products / Services Catalog | Pilih item katalog: CCTV, installation, network cabling, maintenance |
| v1.4: File Attachments | RFQ, purchase order, contract, payment proof, supporting documents; pilih Supabase Storage/S3/R2 dengan private access |
| v1.5: AI RFQ Extraction | Paste/upload kebutuhan customer → structured requirement dan draft quotation; review manusia sebelum save |
| v1.6: AI Document Extraction | RFQ PDF → customer, deadline, requested items, quantity, requirements; keluaran reviewable |
| v1.7: Analytics | Win rate, average deal size, average sales cycle, revenue by salesperson, lost reason analysis, quotation conversion rate |
| v1.8: Integrations | Accurate, Kledo, Xero, Google Calendar, WhatsApp, email, payment gateway |

Kandidat tambahan dari keputusan penjelas: payment correction/credit note, invoice void/refund, split invoicing, multi-organization membership, dan SaaS subscription billing. Semuanya membutuhkan requirement tersendiri sebelum implementasi. Roadmap tidak otomatis mengizinkan Redis/microservices/Kafka/Kubernetes/Elasticsearch.

## 21. Instruksi implementasi untuk developer dan AI coding assistant

`AI-01`: Baca dokumen ini sebelum membuat schema, routes, atau komponen. Mulai dari milestone kecil yang end-to-end dan sebutkan requirement IDs yang dipenuhi. Jangan menandai requirement selesai dari scaffold/mock UI saja.

`AI-02`: Gunakan stack §4 dan modular monolith §5. Jangan mengganti Drizzle dengan Prisma, Better Auth dengan Auth.js/Supabase Auth, atau Vercel dengan hosting lain tanpa perubahan keputusan eksplisit. Jangan menambahkan backend terpisah atau infrastruktur di luar scope untuk kenyamanan generator.

`AI-03`: Implementasikan business rules di service/domain dengan repository tenant-scoped. Jangan menghitung source-of-truth finance di browser, menerima role/tenant dari input tanpa verifikasi, atau memindahkan logic sensitif ke Client Component.

`AI-04`: Periksa dokumentasi versi dependency terpasang, bukan contoh dari major lama. Review auth/plugin-generated schema sebelum migration. Gunakan TypeScript strict dan tipe DTO; hindari `any`, suppression type error, atau mematikan lint/security check agar build lolos.

`AI-05`: Tambahkan migration versioned untuk perubahan schema; jangan mengedit migration yang sudah diaplikasikan ke environment bersama. Sertakan dampak index/data/backfill dan kompatibilitas rollback pada review. Jangan menjalankan seed/reset/destructive schema command pada production.

`AI-06`: Buat test yang membuktikan perilaku bisnis dan failure mode, khususnya tenant leakage, status, rounding, snapshot, dan concurrent payment. Jalankan checks yang relevan; laporkan checks yang benar-benar dijalankan dan hasilnya. Jangan membuat test yang sekadar menyalin implementasi atau mengubah expected agar bug diterima.

`AI-07`: Jangan menambahkan fitur post-MVP, external account subscription, email bisnis otomatis, atau integrasi berbayar hanya karena tool tersedia. Pengiriman manual/otomatis harus mengikuti workflow dan permission produk, dengan status yang mencerminkan kenyataan.

`AI-08`: Jika menemukan kontradiksi yang mengubah hasil bisnis, catat bagian dan pilihan penyelesaian; jangan mengarang keputusan lama. Gunakan default §3 untuk ambiguitas yang sudah ditutup. Perubahan requirement harus menyertakan alasan dan test yang terdampak.

`AI-09`: Dalam laporan perubahan, tulis perilaku yang berubah, requirement IDs, migrasi/env baru, validation evidence, dan keterbatasan nyata. Jangan mengklaim production-ready sebelum checklist §20.3 terpenuhi.

Pegangan scope: **DealFlow membantu bisnis B2B mengubah calon customer menjadi quotation, follow-up, deal, invoice, dan payment dalam satu workflow.** Jika fitur tidak membantu alur ini, fitur tersebut bukan prioritas MVP.

## 22. Matriks keterlacakan seluruh PRD asal

Nomor kolom pertama adalah nomor bagian pada PRD asal, bukan nomor bagian dokumen final ini. "Dipertahankan" mencakup aturan wajib maupun sifat opsional aslinya; detail engineering baru ditandai melalui §3 dan requirement teknis.

| PRD asal | Pokok requirement | Lokasi final |
|---|---|---|
| 1 | Overview dan sales-to-cash flow | §2.1, §19.2 |
| 2 | Product goal dan visibility revenue | §2.1, §11.1 |
| 3 | Semua target users B2B | §2.1 |
| 4 | Owner/Admin, Sales, Finance | §3, §6.2 |
| 5 | Customer required/optional fields | §7.1 |
| 6 | Deal, banyak deal/customer, status/flow | §7.2-7.3 |
| 7 | Deal information dan optional fields | DEAL-01 |
| 8 | Active pipeline dan optional drag-and-drop | §2.3, DEAL-07, UX-03 |
| 9 | Quotation relations dan fields | §8.1 |
| 10 | Item fields dan calculation formula | QUO-02, §13 |
| 11 | Auto quotation number | QUO-04, DATA-02 |
| 12 | DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED | §8.3 |
| 13 | Quotation PDF dan seluruh kontennya | §8.4 |
| 14 | Revision R1/R2, snapshot, no overwrite | QUO-05-07 |
| 15 | WhatsApp link, template, editable message | WA-01-03 |
| 16 | Follow-up fields/type | FUP-01-02 |
| 17 | Today/Overdue/Upcoming reminders | FUP-03-05 |
| 18 | WON, customer/value, quotation optional | DEAL-04, RBAC-04, INV-01 |
| 19 | LOST reason dan optional note | DEAL-05 |
| 20 | Invoice dari WON, optional copy quotation | INV-01-03 |
| 21 | Auto invoice number | §10.1, INV-04 |
| 22 | Invoice minimum fields | §10.1, §14.1 |
| 23 | Invoice payment/overdue status rules | INV-06-07 |
| 24 | Payment fields dan methods | PAY-01-02 |
| 25 | Partial/final payment | PAY-03-05, AT-14-17 |
| 26 | Pipeline, won-month, outstanding, follow-up, overdue KPIs | DASH-01-03 |
| 27 | Optional Money at Risk >7 days | RISK-01 |
| 28 | Deal activity timeline | AUD-01-04 |
| 29 | Login, hashed password, protected routes, session/logout | AUTH-01-06, §16 |
| 30 | Server-side authorization | §6.2, §15-16 |
| 31 | Satu organization/user, organization_id, isolation | §3, §6.3 |
| 32 | Core data model | §14.1 |
| 33 | Suggested database tables | §14.1; diperluas dengan auth/membership/audit |
| 34 | Simple database search; tanpa Elasticsearch | SEARCH-01-02 |
| 35 | Deal/invoice filters | FILTER-01 |
| 36 | Desktop/tablet/mobile dan common mobile flow | UX-03-04, AT-24 |
| 37 | Live fictional demo, NusaTech, 20+ customers/10+ active deals | DEMO-01-04 |
| 38 | Full happy path | §19.2, TEST-04 |
| 39 | Technical stack | §4-5, §18; pilihan alternatif asal diganti stack final yang disepakati |
| 40 | Unit dan integration/E2E minimum | §19 |
| 41 | created/updated/actor dan essential activity events | AUD-01-04, §14 |
| 42 | Performance, reliability, security, money integrity | §13, §16-18 |
| 43 | Seluruh original out-of-scope | §2.3; Redis dan Elasticsearch juga ditegaskan keluar MVP |
| 44 | v1.1 sampai v1.8 roadmap | §20.4 |
| 45 | Lima product principles | §2.4 |
| 46 | MVP Definition of Done | §20.3 |
| 47 | Core MVP statement | §21, paragraf pegangan scope |

## 23. Sumber teknis dan pemeliharaan keputusan

Sumber bisnis: PRD asal DealFlow, dipetakan lengkap pada §22. Sumber keputusan stack: §4, dengan keputusan penjelas pada §3. Tautan dokumentasi resmi yang mendukung detail framework, auth, database pooling, testing, monitoring, dan hosting dicantumkan dekat requirement terkait.

Dokumentasi teknis diperiksa pada 14 September 2026. Versi patch, plan limits, dan dukungan provider tetap perlu divalidasi saat implementasi/release melalui dependency lock, production build, integration tests, dan smoke test. Dokumen ini tidak bergantung pada klaim popularitas stack, benchmark tanpa pengukuran, atau asumsi fitur gratis provider.

Saat ada perubahan, update versi/tanggal dokumen, requirement terkait, ADR bila diperlukan, migration/release notes, dan acceptance tests. Tetap pertahankan core workflow serta batas modular monolith sampai ada kebutuhan yang terbukti untuk mengubahnya.

**Riwayat revisi**

- **1.1 (20 September 2026)**: tiga koreksi dokumentasi ditemukan lewat audit implementasi M1-M3, tidak ada perubahan aturan bisnis atau data. (1) §5.1: struktur folder ilustratif diperbarui dari `src/modules/` terpisah menjadi modul bisnis langsung di bawah `src/server/`, mengikuti konvensi yang sudah konsisten dipakai sejak M1 -- ARCH-02 sendiri tidak berubah. (2) §10.1: field table invoice menambahkan `notes`/`terms`, yang sebelumnya tidak tercantum padahal INV-02 mengharuskan keduanya disalin dari quotation source -- kontradiksi internal dokumen, bukan implementasi yang menyimpang. (3) §10.1: `paid_amount`/`remaining_amount` diperjelas sebagai nilai turunan yang dihitung ulang saat read, bukan kolom tersimpan, konsisten dengan §14.1 yang sejak awal menandai cache sebagai opsional. Tidak ada ADR terpisah dibuat untuk revisi ini karena ketiganya adalah koreksi framing dokumen terhadap keputusan yang sudah berjalan, bukan keputusan arsitektur baru.
