# ADR-0001: Pipeline berbasis kondisi, on hold, dan reopen

- **Status:** Diterima, 29 Oktober 2026
- **Menggantikan:** DEAL-03, DEAL-04, DEAL-05, DEAL-06, DEAL-07, DEAL-08, RISK-01, QUO-08, QUO-09 (versi 1.2)
- **Terkait:** ADR-0002 (WON membuat pesanan)

## Konteks

Pipeline 1.2 memiliki tujuh status linear (`NEW`, `CONTACTED`, `QUALIFIED`, `QUOTATION`, `NEGOTIATION`, `WON`, `LOST`), hanya boleh maju satu langkah, dan WON/LOST terminal. Audit discovery B2B (28 Oktober 2026) dan business system map menemukan masalah berikut:

1. **Stage mencatat aktivitas, bukan posisi peluang.** "Dihubungi" dan "Terkualifikasi" adalah penilaian sales atau aktivitas, tidak membuktikan kemajuan peluang. Semua deal aktif, termasuk yang belum dibalas, ikut dijumlah sebagai nilai pipeline.
2. **Tidak ada tempat untuk "harga disetujui, PO belum keluar".** Sales terpaksa menutup Won terlalu cepat atau membiarkan deal di Negosiasi tanpa ada negosiasi.
3. **Tidak bisa mundur.** Customer mengubah scope, penawaran kedaluwarsa, anggaran dipotong. Larangan mundur memaksa stage tidak sesuai kenyataan atau data dipalsukan.
4. **Tidak ada penundaan.** "Anggaran tahun depan" hanya bisa jadi Lost atau dibiarkan menggembungkan pipeline.
5. **Won/Lost salah tidak bisa dikoreksi** di aplikasi.

## Keputusan

**Empat stage aktif**, lalu dua hasil akhir:

| Key | Label | Arti |
|---|---|---|
| `PROSPECT` | Gali kebutuhan | Kebutuhan atau scope belum cukup jelas untuk penawaran spesifik. Nilai boleh kosong |
| `PROPOSAL` | Penawaran dikirim | Harga, scope, dan ketentuan spesifik sudah disampaikan |
| `NEGOTIATION` | Negosiasi | Ada perubahan atau keberatan komersial yang belum selesai |
| `COMMITMENT` | Menunggu komitmen | Ketentuan utama disetujui; PO, kontrak, atau pembayaran belum ada |
| `WON` | Menang | Pesanan pertama tercatat dengan bukti komitmen (ADR-0002) |
| `LOST` | Tidak dilanjutkan | Peluang ditutup dengan alasan |

- Perpindahan antar stage aktif **bebas** (maju, lompat, mundur), selalu menulis event `stage_changed` dan menyetel `stage_entered_at`.
- WON dan LOST dapat dicapai dari stage aktif mana pun.
- **On hold bukan stage.** Ia overlay (`on_hold_until`, `on_hold_reason`): stage tetap tersimpan, deal tidak dihitung di pipeline, dan perpindahan stage ditolak sampai resume.
- **Reopen** diaudit: LOST kembali aktif oleh Owner/Admin atau owner deal; WON kembali aktif hanya oleh Owner/Admin dan hanya bila tidak ada invoice non-void.
- **Kesehatan deal dihitung saat baca**, tanpa kolom: tanpa langkah berikutnya, task terlambat, stage mandek, lewat target tanggal, tinjau ulang on hold. Ini menggantikan Money at Risk.
- **Nilai pipeline hanya `PROPOSAL`, `NEGOTIATION`, `COMMITMENT` yang tidak on hold.** `PROSPECT` dihitung sebagai jumlah, bukan nilai.
- **Quotation hanya boleh memajukan stage:** SENT memajukan `PROSPECT` ke `PROPOSAL` (dan mengisi nilai bila kosong); ACCEPTED memajukan `PROPOSAL`/`NEGOTIATION` ke `COMMITMENT`. Tidak ada kejadian quotation yang membuat WON atau LOST.

## Alternatif yang ditolak

- **Entitas Lead terpisah** dari Deal. Memecahkan masalah inflasi pipeline, tetapi menambah tabel, konversi, dan aturan duplikasi untuk tim 1-30 orang. Cukup dengan `PROSPECT` yang tidak bernilai di pipeline. Ditinjau ulang bila pengguna mengimpor ratusan prospek.
- **Stage dikonfigurasi per organisasi.** Ditunda sampai ada bukti empat stage tidak cukup untuk dua dari lima pengguna awal.
- **ON_HOLD sebagai stage.** Menghilangkan informasi stage sebelumnya dan melanggar prinsip satu konsep satu tempat.
- **Probabilitas dan weighted forecast.** Tidak ada histori konversi untuk dikalibrasi; probabilitas karangan menyesatkan forecast.

## Konsekuensi

- Migrasi data: `NEW`, `CONTACTED`, `QUALIFIED` menjadi `PROSPECT`; `QUOTATION` menjadi `PROPOSAL`. Deal terbuka bernilai 0 di `PROPOSAL`/`NEGOTIATION` dipindah ke `PROSPECT` dan dicatat di laporan migrasi.
- `deals.status` mendapat CHECK enum (menutup debt #9).
- Test wajib: lompat dan mundur stage, WON dari setiap stage aktif, on hold menahan perpindahan stage, reopen WON ditolak bila ada invoice, tiga task email tidak mengubah stage atau nilai pipeline.
- UI: label stage dan tombol "langkah berikutnya" diganti; perpindahan bebas tersedia lewat menu.
