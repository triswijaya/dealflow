// Fictional demo data (DEMO-01/DEMO-03). Every company, person and number here is
// invented; phone numbers use an obviously unassigned 0811-0000-xxxx pattern and
// email addresses use reserved .test domains, so nothing can reach a real person.

/** Shared demo password for every seeded account (documented in README, DEMO-04). */
export const DEMO_PASSWORD = "NusaTech-Demo-2026";

export const ORG = {
  name: "NusaTech Solutions",
  people: [
    { key: "owner", name: "Aditya Pratama", email: "aditya@nusatech.test", role: "OWNER" },
    { key: "admin", name: "Maya Kusuma", email: "maya@nusatech.test", role: "ADMIN" },
    { key: "andi", name: "Andi Wijaya", email: "andi@nusatech.test", role: "SALES" },
    { key: "rina", name: "Rina Oktaviani", email: "rina@nusatech.test", role: "SALES" },
    { key: "dewi", name: "Dewi Lestari", email: "dewi@nusatech.test", role: "FINANCE" },
  ],
} as const;

export const SECOND_ORG = {
  name: "Kreasi Cipta Digital",
  owner: { name: "Bagas Saputra", email: "bagas@kreasicipta.test" },
  customers: [
    { companyName: "PT Lentera Media Utama", contactPerson: "Sinta Maharani", phone: "0811-0000-9001", email: "sinta@lenteramedia.test", address: "Jl. Kemang Raya No. 18, Jakarta Selatan" },
    { companyName: "Kopi Senja Nusantara", contactPerson: "Reza Aditya", phone: "0811-0000-9002", email: "reza@kopisenja.test", address: "Jl. Braga No. 42, Bandung" },
    { companyName: "Studio Bata Merah", contactPerson: "Laras Wulandari", phone: "0811-0000-9003", email: "laras@batamerah.test", address: "Jl. Dago Atas No. 7, Bandung" },
  ],
  deals: [
    { customer: 0, title: "Redesain website korporat", value: 45_000_000 },
    { customer: 1, title: "Kampanye peluncuran produk baru", value: 28_000_000 },
  ],
} as const;

export const CUSTOMERS = [
  { companyName: "PT Sentra Niaga", contactPerson: "Hendra Gunawan", phone: "0811-0000-1001", email: "hendra@sentraniaga.test", address: "Jl. Ahmad Yani No. 112, Bekasi", notes: "Pelanggan lama, kontrak maintenance berjalan." },
  { companyName: "PT Bumi Karya Konstruksi", contactPerson: "Yulia Rahmawati", phone: "0811-0000-1002", email: "yulia@bumikarya.test", address: "Jl. Raya Bogor Km 23, Jakarta Timur", notes: "Proyek gedung kantor baru, butuh jaringan dan CCTV." },
  { companyName: "PT Maju Jaya Logistik", contactPerson: "Budi Santoso", phone: "0811-0000-1003", email: "budi@majujaya.test", address: "Kawasan Industri MM2100, Bekasi", notes: "Gudang baru, bagian purchasing berkoordinasi lewat WhatsApp." },
  { companyName: "Klinik Sehat Sentosa", contactPerson: "dr. Lestari Anggraini", phone: "0811-0000-1004", email: "lestari@kliniksentosa.test", address: "Jl. Margonda Raya No. 55, Depok", notes: "Pembayaran biasanya bertahap." },
  { companyName: "CV Arta Graha Mandiri", contactPerson: "Arif Hidayat", phone: "0811-0000-1005", email: "arif@artagraha.test", address: "Jl. BSD Boulevard No. 9, Tangerang", notes: null },
  { companyName: "Hotel Mega Kencana", contactPerson: "Siti Nurhaliza", phone: "0811-0000-1006", email: "siti@megakencana.test", address: "Jl. M.H. Thamrin No. 30, Jakarta Pusat", notes: "Proses persetujuan lewat manajemen properti." },
  { companyName: "PT Cipta Pangan Nusantara", contactPerson: "Wahyu Prakoso", phone: "0811-0000-1007", email: "wahyu@ciptapangan.test", address: "Kawasan Jababeka, Cikarang", notes: "Pabrik makanan, perlu CCTV area produksi." },
  { companyName: "Sekolah Tunas Harapan", contactPerson: "Ratna Dewi", phone: "0811-0000-1008", email: "ratna@tunasharapan.test", address: "Jl. Pajajaran No. 14, Bogor", notes: null },
  { companyName: "PT Graha Prima Properti", contactPerson: "Michael Tan", phone: "0811-0000-1009", email: "michael@grahaprima.test", address: "Jl. Sudirman Kav. 52, Jakarta Selatan", notes: "Gedung baru selesai tahap finishing." },
  { companyName: "Toko Elektronik Sinar Terang", contactPerson: "Agus Salim", phone: "0811-0000-1010", email: "agus@sinarterang.test", address: "Jl. Mangga Besar No. 21, Jakarta Barat", notes: null },
  { companyName: "PT Samudra Biru Logistik", contactPerson: "Fajar Ramadhan", phone: "0811-0000-1011", email: "fajar@samudrabiru.test", address: "Jl. Pluit Raya No. 8, Jakarta Utara", notes: "Dermaga dan gudang transit." },
  { companyName: "RS Pelita Bangsa", contactPerson: "Nurul Aini", phone: "0811-0000-1012", email: "nurul@pelitabangsa.test", address: "Jl. Cut Meutia No. 3, Bekasi", notes: "Keputusan lewat komite pengadaan." },
  { companyName: "PT Mitra Digital Kreasi", contactPerson: "Kevin Halim", phone: "0811-0000-1013", email: "kevin@mitradigital.test", address: "Jl. TB Simatupang No. 77, Jakarta Selatan", notes: "Kantor baru, pindah bulan depan." },
  { companyName: "CV Berkah Mebel Jaya", contactPerson: "Slamet Riyadi", phone: "0811-0000-1014", email: "slamet@berkahmebel.test", address: "Kawasan Industri Delta Silicon, Cikarang", notes: null },
  { companyName: "PT Karya Teknik Utama", contactPerson: "Doni Setiawan", phone: "0811-0000-1015", email: "doni@karyateknik.test", address: "Jl. Gatot Subroto No. 40, Jakarta Selatan", notes: null },
  { companyName: "Yayasan Pendidikan Cahaya", contactPerson: "Lukman Hakim", phone: "0811-0000-1016", email: "lukman@pendidikancahaya.test", address: "Jl. Raya Sawangan No. 61, Depok", notes: "Kampus dengan tiga gedung." },
  { companyName: "PT Anugerah Retail Indonesia", contactPerson: "Linda Susanto", phone: "0811-0000-1017", email: "linda@anugerahretail.test", address: "Jl. Daan Mogot Km 11, Jakarta Barat", notes: null },
  { companyName: "Gudang Dingin Prima", contactPerson: "Rudi Hartono", phone: "0811-0000-1018", email: "rudi@gudangdingin.test", address: "Kawasan Industri EJIP, Cikarang", notes: "Cold storage, pernah dipasang CCTV tahap 1." },
  { companyName: "PT Baja Ringan Sentosa", contactPerson: "Teguh Widodo", phone: "0811-0000-1019", email: "teguh@bajaringan.test", address: "Jl. Raya Serpong No. 90, Tangerang Selatan", notes: null },
  { companyName: "Apartemen Taman Asri", contactPerson: "Diana Puspita", phone: "0811-0000-1020", email: "diana@tamanasri.test", address: "Jl. Kuningan Barat No. 5, Jakarta Selatan", notes: "Pengelola gedung, area parkir luas." },
  { companyName: "PT Jaringan Andalan Prima", contactPerson: "Bambang Kuncoro", phone: "0811-0000-1021", email: "bambang@jaringanandalan.test", address: "Jl. Raya Narogong Km 8, Bekasi", notes: null },
  { companyName: "Restoran Rasa Nusantara", contactPerson: "Bambang Hermawan", phone: "0811-0000-1022", email: "bambang@rasanusantara.test", address: "Jl. Kelapa Gading Raya No. 25, Jakarta Utara", notes: null },
  { companyName: "PT Event Meriah Indonesia", contactPerson: "Citra Maharani", phone: "0811-0000-1023", email: "citra@eventmeriah.test", address: "Jl. Kebon Jeruk Raya No. 33, Jakarta Barat", notes: "Butuh jaringan sementara untuk acara." },
  { companyName: "Bengkel Auto Prima", contactPerson: "Yusuf Maulana", phone: "0811-0000-1024", email: "yusuf@autoprima.test", address: "Jl. Raya Pondok Gede No. 70, Bekasi", notes: null },
] as const;

export type Stage = "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTATION" | "NEGOTIATION" | "WON" | "LOST";
export type TemplateName = "cctv" | "network" | "maintenance" | "access";
export type QuoteKind = "draft" | "sent" | "expired" | "revised" | "accepted" | "rejected";
export type InvoiceKind = "paid" | "partial" | "unpaid" | "overdue" | "partialOverdue";
export type FollowUpType = "CALL" | "WHATSAPP" | "EMAIL" | "MEETING" | "OTHER";

export type DealSpec = {
  customer: number; // index into CUSTOMERS
  sales: "andi" | "rina";
  title: string;
  description: string;
  value: number;
  closeInDays: number;
  stage: Stage;
  template?: TemplateName;
  size?: number; // camera / access-point / reader count
  quote?: QuoteKind;
  lost?: { reason: "PRICE_TOO_HIGH" | "LOST_TO_COMPETITOR" | "NO_RESPONSE" | "PROJECT_CANCELLED" | "BUDGET_UNAVAILABLE" | "OTHER"; note: string };
  invoice?: InvoiceKind;
  // done: logged interaction that already happened. Otherwise a reminder at `days` from the anchor date.
  followUps?: { type: FollowUpType; note: string; days: number; time: string; done?: boolean }[];
};

export const DEALS: DealSpec[] = [
  // NEW
  { customer: 17, sales: "andi", title: "CCTV gudang dingin tahap 2", description: "Tambah kamera di area bongkar muat dan ruang chiller.", value: 25_000_000, closeInDays: 35, stage: "NEW", followUps: [{ type: "CALL", note: "Jadwalkan survei lokasi", days: 2, time: "10:00" }] },
  { customer: 16, sales: "rina", title: "WiFi lantai 3 gedung retail", description: "Perluasan jaringan nirkabel area kasir dan gudang.", value: 18_500_000, closeInDays: 30, stage: "NEW", followUps: [{ type: "WHATSAPP", note: "Kirim daftar pertanyaan kebutuhan", days: 0, time: "11:00" }] },
  { customer: 7, sales: "andi", title: "Maintenance CCTV tahunan sekolah", description: "Pemeriksaan berkala 4 kali setahun.", value: 9_600_000, closeInDays: 28, stage: "NEW" },
  // CONTACTED
  { customer: 11, sales: "rina", title: "Upgrade NVR dan storage rumah sakit", description: "Perpanjang masa simpan rekaman menjadi 90 hari.", value: 62_000_000, closeInDays: 40, stage: "CONTACTED", followUps: [{ type: "CALL", note: "Tanya jadwal rapat komite pengadaan", days: -1, time: "13:00" }] },
  { customer: 12, sales: "andi", title: "Access control kantor baru", description: "Kontrol akses 6 pintu dan integrasi absensi.", value: 41_000_000, closeInDays: 45, stage: "CONTACTED", template: "access", size: 6, followUps: [{ type: "WHATSAPP", note: "Minta denah lantai kantor", days: -3, time: "09:30" }] },
  { customer: 9, sales: "rina", title: "Instalasi LAN ruko", description: "Penarikan kabel dan rak jaringan di dua lantai.", value: 14_500_000, closeInDays: 21, stage: "CONTACTED" },
  // QUALIFIED
  { customer: 6, sales: "andi", title: "CCTV 24 titik area produksi", description: "Kamera tahan debu dan lembap untuk lini produksi.", value: 78_000_000, closeInDays: 30, stage: "QUALIFIED", template: "cctv", size: 24, quote: "draft", followUps: [{ type: "CALL", note: "Bahas spesifikasi kamera", days: 3, time: "10:00" }] },
  { customer: 15, sales: "rina", title: "Fiber optic backbone kampus", description: "Backbone antar tiga gedung dan switch distribusi.", value: 95_000_000, closeInDays: 50, stage: "QUALIFIED", template: "network", size: 8, quote: "draft", followUps: [{ type: "MEETING", note: "Presentasi rencana jaringan", days: 5, time: "14:00" }] },
  { customer: 3, sales: "andi", title: "Sistem antrean klinik", description: "Layar antrean dan aplikasi pendaftaran pasien.", value: 22_000_000, closeInDays: 33, stage: "QUALIFIED" },
  // QUOTATION
  { customer: 0, sales: "rina", title: "Maintenance tahunan CCTV", description: "Kontrak perawatan 12 bulan untuk 20 kamera.", value: 18_000_000, closeInDays: 14, stage: "QUOTATION", template: "maintenance", quote: "sent", followUps: [{ type: "CALL", note: "Konfirmasi spesifikasi", days: -6, time: "10:00", done: true }, { type: "WHATSAPP", note: "Tanyakan keputusan quotation", days: 0, time: "10:00" }] },
  { customer: 5, sales: "andi", title: "Paket CCTV hotel 32 kamera", description: "Lobi, koridor, parkir, dan area back office.", value: 87_500_000, closeInDays: 20, stage: "QUOTATION", template: "cctv", size: 32, quote: "sent", followUps: [{ type: "EMAIL", note: "Kirim ulang penawaran ke manajemen", days: -2, time: "15:00" }] },
  { customer: 19, sales: "rina", title: "Wireless mesh area parkir", description: "Jaringan nirkabel di tiga lantai parkir.", value: 31_000_000, closeInDays: 10, stage: "QUOTATION", template: "network", size: 9, quote: "expired", followUps: [{ type: "CALL", note: "Tanya apakah penawaran masih diproses", days: 1, time: "11:30" }] },
  // NEGOTIATION
  { customer: 1, sales: "andi", title: "Renovasi jaringan kantor pusat", description: "Penataan ulang kabel dan switch di empat lantai.", value: 48_500_000, closeInDays: 12, stage: "NEGOTIATION", template: "network", size: 8, quote: "revised", followUps: [{ type: "WHATSAPP", note: "Bahas revisi harga", days: -3, time: "16:00", done: true }, { type: "MEETING", note: "Negosiasi akhir di kantor klien", days: 2, time: "13:00" }] },
  { customer: 8, sales: "rina", title: "CCTV dan alarm gedung baru", description: "Paket keamanan lengkap untuk gedung 8 lantai.", value: 120_000_000, closeInDays: 18, stage: "NEGOTIATION", template: "cctv", size: 40, quote: "sent", followUps: [{ type: "CALL", note: "Finalisasi jadwal pemasangan", days: 0, time: "14:00" }, { type: "EMAIL", note: "Kirim draf kontrak", days: -5, time: "09:00", done: true }] },
  { customer: 14, sales: "andi", title: "Smart building cabling", description: "Kabel terstruktur dan titik akses nirkabel.", value: 56_000_000, closeInDays: 15, stage: "NEGOTIATION", template: "network", size: 12, quote: "sent", followUps: [{ type: "WHATSAPP", note: "Tanya keputusan akhir", days: 1, time: "10:30" }] },
  // WON
  { customer: 2, sales: "andi", title: "CCTV Installation - Bekasi", description: "16 kamera 4MP untuk gudang baru.", value: 30_000_000, closeInDays: -10, stage: "WON", template: "cctv", size: 16, quote: "accepted", invoice: "paid", followUps: [{ type: "CALL", note: "Konfirmasi spesifikasi", days: -26, time: "10:00", done: true }] },
  { customer: 3, sales: "rina", title: "Paket CCTV klinik", description: "Kamera di ruang tunggu, apotek, dan parkir.", value: 30_000_000, closeInDays: -8, stage: "WON", template: "cctv", size: 14, quote: "accepted", invoice: "partial" },
  { customer: 4, sales: "andi", title: "Server room dan jaringan kantor", description: "Rak server, UPS, dan kabel terstruktur.", value: 24_000_000, closeInDays: -5, stage: "WON", template: "network", size: 4, quote: "accepted", invoice: "unpaid" },
  { customer: 10, sales: "rina", title: "CCTV dermaga dan gudang transit", description: "Kamera outdoor dengan perlindungan cuaca.", value: 36_000_000, closeInDays: -30, stage: "WON", template: "cctv", size: 18, quote: "accepted", invoice: "overdue" },
  { customer: 13, sales: "andi", title: "Instalasi LAN gudang", description: "Penarikan kabel dan switch untuk area gudang.", value: 15_000_000, closeInDays: -22, stage: "WON", template: "network", size: 3, quote: "accepted", invoice: "partialOverdue" },
  { customer: 20, sales: "rina", title: "Kamera pengawas ruko", description: "Paket 6 kamera untuk dua unit ruko.", value: 12_000_000, closeInDays: -1, stage: "WON", template: "cctv", size: 6, quote: "accepted" },
  // LOST
  { customer: 21, sales: "rina", title: "Sistem absensi sidik jari", description: "Mesin absensi untuk dua cabang.", value: 17_500_000, closeInDays: -15, stage: "LOST", lost: { reason: "PRICE_TOO_HIGH", note: "Klien memilih penawaran yang 18% lebih murah." } },
  { customer: 23, sales: "andi", title: "CCTV bengkel dan showroom", description: "Delapan kamera area servis dan showroom.", value: 26_000_000, closeInDays: -12, stage: "LOST", template: "cctv", size: 8, quote: "rejected", lost: { reason: "LOST_TO_COMPETITOR", note: "Memakai vendor lama yang sudah menjadi langganan." } },
  { customer: 22, sales: "rina", title: "WiFi outdoor acara tahunan", description: "Jaringan sementara untuk acara dua hari.", value: 21_000_000, closeInDays: -20, stage: "LOST", lost: { reason: "NO_RESPONSE", note: "Tidak ada balasan setelah tiga kali follow-up." } },
];
