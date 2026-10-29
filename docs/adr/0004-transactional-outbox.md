# ADR-0004: Transactional outbox dengan Vercel Cron

- **Status:** Diterima, 29 Oktober 2026
- **Mengubah:** §2.3 (tanpa queue/background worker), ARCH-06, OBS-05 pada versi 1.2
- **Terkait:** G-01 pada business system map (email tidak pernah terkirim)

## Konteks

Email akun (verifikasi, reset, undangan) hanya ditulis ke log. Produk v2 menambah email penawaran dan invoice ke customer serta ringkasan harian. Pengiriman email adalah side effect yang boleh gagal tanpa membatalkan transaksi bisnis (DATA-06), tetapi juga tidak boleh hilang diam-diam atau terkirim dua kali.

Aplikasi berjalan di Vercel: tidak ada proses yang hidup lama (ARCH-06), sehingga "kirim lalu coba lagi" dari memori tidak tersedia.

## Keputusan

- Tabel `outbox_events` di PostgreSQL: `type`, `payload`, `dedupe_key` (unik per tenant), `status` (`PENDING`, `SENT`, `FAILED`, `DEAD`), `attempts`, `next_attempt_at`, `locked_until`, `last_error` (kategori, tanpa data sensitif).
- Baris outbox ditulis **di transaksi yang sama** dengan perubahan bisnis yang memicunya.
- Setelah commit, action mencoba mengirim langsung. Jika gagal, baris tetap `PENDING`/`FAILED`.
- **Vercel Cron** memanggil `/api/cron/outbox` untuk menyapu: `SELECT ... FOR UPDATE SKIP LOCKED`, backoff bertambah, batas percobaan, lalu `DEAD` yang terlihat oleh Owner/Admin. Endpoint dilindungi secret, idempoten, aman dari tumpang tindih (OBS-05), dan kemajuannya tersimpan.
- Email dikirim lewat satu provider transaksional memakai HTTP API di `send-email.ts`, hanya dipanggil oleh handler outbox.
- Kebenaran status (overdue, expired) **tidak** bergantung pada cron. Cron hanya mengirim side effect.

## Alternatif yang ditolak

- **Kirim langsung di dalam request tanpa antrian.** Email gagal membatalkan invoice, atau invoice terbit tanpa email dan tanpa jejak.
- **BullMQ, Redis, message broker.** Tetap di luar cakupan (§2.3); tabel PostgreSQL cukup untuk volume tim kecil dan tidak menambah infrastruktur.
- **`after()` / proses setelah response.** Tidak menjamin eksekusi dan tidak memberi retry.

## Konsekuensi

- Plan Vercel Hobby membatasi frekuensi cron (kira-kira harian). Itu cukup karena pengiriman pertama dicoba langsung setelah commit; cron hanya menyapu yang gagal. Periksa batas plan saat rilis.
- Test wajib: handler gagal lalu diulang tidak mengirim dua kali (dedupe); invoice tetap terbit saat email gagal; dua sapuan bersamaan tidak memproses baris yang sama; event yang melebihi batas percobaan menjadi `DEAD`.
- Operasional: `DEAD` muncul di `pnpm reconcile` dan di halaman pengaturan Owner.
