// Every claim on the landing page, in one place, so it can be checked against the product.
// Labels quoted from the app (menu names, stage names, statuses) are copied exactly.

export const NAV = [
  { id: "produk", label: "Produk" },
  { id: "peran", label: "Peran" },
  { id: "harga", label: "Harga" },
  { id: "faq", label: "FAQ" },
] as const;

export type NavId = (typeof NAV)[number]["id"];

/** Facts shown under the hero call to action. Each is a behaviour of the product, not a metric. */
export const HERO_FACTS = ["Rupiah tanpa desimal", "Termin DP dan BAST", "Waktu WIB", "Empat peran"];

/** Where one deal lives before DealFlow. The names are the ones teams really use. */
export const SCATTERED = [
  { icon: "chat", name: "Grup WhatsApp Sales", meta: "Penawaran terakhir di atas 214 pesan", pain: "Tindak lanjut terlewat" },
  { icon: "sheet", name: "Pipeline 2026.xlsx", meta: "Diubah 3 orang minggu ini", pain: "Angka beda versi" },
  { icon: "pdf", name: "Penawaran_FINAL_v3(2).pdf", meta: "Satu dari 4 berkas penawaran", pain: "Revisi mana yang dikirim?" },
  { icon: "book", name: "Buku tagihan finance", meta: "Dicek manual tiap akhir bulan", pain: "Termin lupa ditagih" },
] as const;

/** One deal of the demo company, told as the single history DealFlow keeps. */
export const HISTORY = [
  { what: "Penawaran QT-2026-00004 dikirim", who: "Andi Wijaya", when: "3 Nov" },
  { what: "Deal menang dengan PO/HMK/2026/0412", who: "Aditya Pratama", when: "15 Nov" },
  { what: "Invoice termin DP 30% diterbitkan", who: "Dewi Lestari", when: "15 Nov" },
  { what: "Pembayaran Rp26.250.000 dicatat", who: "Dewi Lestari", when: "18 Nov" },
];

export type TourKey = "pipeline" | "quotation" | "order" | "invoice" | "reports";

export const TOUR: { key: TourKey; label: string; title: string; body: string; alt: string }[] = [
  {
    key: "pipeline",
    label: "Pipeline",
    title: "Tahu deal mana yang harus dikejar hari ini",
    body: "Geser kartu antar tahap seperti di papan tugas. Tugas terlambat, deal yang lama diam, dan target yang lewat ditandai otomatis.",
    alt: "Papan pipeline DealFlow dengan empat tahap: Gali kebutuhan, Penawaran dikirim, Negosiasi, dan Menunggu komitmen, berisi kartu deal beserta nilainya.",
  },
  {
    key: "quotation",
    label: "Penawaran",
    title: "Revisi harga tanpa kehilangan versi lama",
    body: "Setiap revisi tersimpan sebagai R1, R2, dan seterusnya, lengkap dengan riwayat statusnya. PDF siap kirim, pesan WhatsApp sudah disiapkan.",
    alt: "Halaman penawaran QT-2026-00006-R2 dengan dokumen quotation dan riwayat versi R1 serta versi awal.",
  },
  {
    key: "order",
    label: "Pesanan",
    title: "Deal menang langsung jadi pesanan bertermin",
    body: "Kunci kemenangan dengan PO, kontrak, atau DP. Pilih rencana termin, misalnya DP 30% saat pesanan lalu 70% setelah BAST.",
    alt: "Pesanan SO-2026-00007 untuk Hotel Mega Kencana dengan rencana termin DP 30% siap ditagih dan pelunasan 70% setelah BAST.",
  },
  {
    key: "invoice",
    label: "Invoice",
    title: "Tagih per termin, catat pembayaran sebagian",
    body: "Nilai invoice selalu sama dengan termin yang ditagih. Pembayaran sebagian, potongan PPh, dan kelebihan bayar tercatat terpisah.",
    alt: "Invoice INV-2026-00002 berstatus dibayar sebagian: total Rp30.000.000, terbayar Rp10.000.000, sisa Rp20.000.000.",
  },
  {
    key: "reports",
    label: "Laporan",
    title: "Piutang dan kas tanpa menyusun spreadsheet",
    body: "Bookings, tagihan, kas diterima, win rate, dan umur piutang dengan definisi yang sama dengan finance. Ekspor CSV untuk akuntan.",
    alt: "Halaman laporan dengan bookings, ditagih, kas diterima, win rate, piutang, dan grafik aging piutang.",
  },
];

/** Menus copied from the sidebar of each role (src/components/app-shell/nav.ts). */
export const ROLES = [
  {
    name: "Owner dan Admin",
    lead: "Melihat semua angka, mengatur anggota dan pengaturan perusahaan.",
    menus: ["Ringkasan", "Antrian kerja", "Laporan", "Pipeline", "Deal", "Customer", "Penawaran", "Follow-up", "Pesanan", "Invoice", "Uang masuk", "Pengaturan"],
    hidden: [] as string[],
  },
  {
    name: "Sales",
    lead: "Fokus pada customer, deal, penawaran, dan tindak lanjut.",
    menus: ["Ringkasan", "Antrian kerja", "Laporan", "Pipeline", "Deal", "Customer", "Penawaran", "Follow-up", "Pesanan"],
    hidden: ["Invoice", "Uang masuk", "Pengaturan"],
  },
  {
    name: "Finance",
    lead: "Menagih dari pesanan dan mencatat setiap rupiah yang diterima.",
    menus: ["Ringkasan", "Antrian kerja", "Laporan", "Deal menang", "Customer", "Pesanan", "Invoice", "Uang masuk"],
    hidden: ["Pipeline", "Penawaran", "Follow-up"],
  },
];

export const STEPS = [
  { title: "Buat ruang kerja", body: "Isi nama perusahaan dan akun Owner. Ruang kerja Anda terpisah dari perusahaan lain." },
  { title: "Undang tim", body: "Kirim undangan ke Sales, Finance, atau Admin. Menu dan akses mengikuti peran setiap anggota." },
  { title: "Catat deal pertama", body: "Tambahkan customer, buat deal, lalu kirim penawaran. Dari sana alurnya berjalan sampai lunas." },
];

/** Proposed plans. They are not on sale yet, which the page says next to them. */
export const PLANS = [
  { name: "Starter", lead: "Untuk pemilik bisnis dan tim sales kecil.", price: "Rp249.000", seats: 3, featured: false },
  { name: "Growth", lead: "Untuk tim yang mulai membagi peran sales dan finance.", price: "Rp499.000", seats: 10, featured: true },
  { name: "Scale", lead: "Untuk lebih banyak anggota dalam satu perusahaan.", price: "Rp999.000", seats: 25, featured: false },
];

export const PLAN_INCLUDES = [
  "Customer, pipeline, dan deal",
  "Penawaran dengan revisi dan PDF",
  "Pesanan, termin, dan invoice",
  "Uang masuk, kredit customer, dan refund",
  "Laporan dan ekspor CSV",
  "Empat peran dengan akses terpisah",
];

export const FAQ = [
  {
    q: "DealFlow cocok untuk bisnis seperti apa?",
    a: "Untuk bisnis B2B yang menjual lewat penawaran dan menagih bertahap: vendor CCTV dan jaringan, kontraktor, agensi, dan penyedia jasa proyek. Tahap pipeline sudah tersedia, jadi tim tidak perlu menyusunnya dari awal.",
  },
  {
    q: "Apakah WhatsApp dikirim otomatis?",
    a: "Tidak. DealFlow menyiapkan pesan yang bisa Anda ubah, lalu membuka WhatsApp. Anda yang menekan kirim. Membuka WhatsApp tidak mengubah status penawaran atau menandai tindak lanjut selesai.",
  },
  {
    q: "Apa bedanya deal menang dan uang masuk?",
    a: "Deal menang berarti customer sudah berkomitmen lewat PO, kontrak atau SPK, konfirmasi tertulis, atau DP. Deal itu menjadi pesanan dengan rencana termin. Uang baru tercatat masuk ketika Finance mencatat pembayaran pada invoice termin tersebut.",
  },
  {
    q: "Bisa mencatat pembayaran sebagian dan potongan PPh?",
    a: "Bisa. Setiap pembayaran mengurangi sisa tagihan, dan potongan PPh dicatat terpisah dari uang yang diterima. Status invoice ikut berubah: Belum dibayar, Dibayar sebagian, Lunas, atau Lewat jatuh tempo.",
  },
  {
    q: "Bagaimana kalau customer membayar lebih?",
    a: "Catat seluruh uang yang diterima di Uang masuk, lalu alokasikan ke invoice. Sisanya menjadi kredit customer yang bisa dipakai untuk invoice berikutnya atau dikembalikan lewat refund.",
  },
  {
    q: "Apakah pajak dihitung otomatis?",
    a: "Diskon dan pajak diisi sebagai nominal Rupiah di penawaran dan invoice, sehingga tarifnya mengikuti kebijakan pajak perusahaan Anda. NPWP customer tersimpan dan ikut tercetak di dokumen.",
  },
  {
    q: "Apakah data perusahaan saya terpisah dari perusahaan lain?",
    a: "Ya. Setiap perusahaan punya ruang kerja sendiri, dan anggota hanya melihat data organisasinya sesuai peran. Perubahan penting tercatat di log audit beserta siapa yang melakukannya.",
  },
  {
    q: "Bisa mengambil data untuk akuntan?",
    a: "Bisa. Dari Laporan, unduh CSV invoice, uang masuk, dan pesanan untuk periode yang dipilih. Isi sel yang menyerupai rumus diamankan agar tidak dijalankan oleh Excel atau Sheets.",
  },
  {
    q: "Apakah harga di halaman ini sudah berlaku?",
    a: "Belum. Paket di halaman ini adalah usulan untuk ditinjau. Harga, kapasitas anggota, pajak, dan ketentuan langganan ditetapkan sebelum penjualan dibuka.",
  },
];
