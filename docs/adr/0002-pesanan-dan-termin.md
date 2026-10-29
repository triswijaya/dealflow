# ADR-0002: Pesanan dan termin sebagai komitmen dan rencana tagih

- **Status:** Diterima, 29 Oktober 2026
- **Menggantikan:** ketentuan "Invoice per deal", DEAL-04, INV-01, INV-04, DATA-02 (satu invoice per deal) pada versi 1.2
- **Terkait:** ADR-0001, ADR-0003

## Konteks

Versi 1.2 menganggap WON sama dengan komitmen dan mewajibkan tepat satu invoice per deal. Vendor proyek dan jasa B2B tidak bekerja begitu:

- Pembeli membayar DP, lalu termin setelah BAST, lalu pelunasan, kadang dengan retensi.
- Satu deal menghasilkan dua PO (hardware dan instalasi).
- Pembeli tunai atau repeat order tidak melewati pipeline.
- Nilai berubah setelah kontrak (kerja tambah atau kurang).
- WON tanpa bukti komitmen membuat angka "menang" menyesatkan.

## Keputusan

Rantai domain: **Deal -> Pesanan -> Termin -> Invoice**.

- **Pesanan (`orders`)** adalah komitmen pembelian: customer, `deal_id` opsional, jenis dan nomor bukti (`PURCHASE_ORDER`, `CONTRACT`, `WRITTEN_CONFIRMATION`, `PAYMENT`, `LEGACY`), nilai awal, quotation sumber opsional. Nomor `SO-YYYY-NNNNN`. Dibuat lewat tiga jalur: `confirmWon` (pesanan pertama, deal menjadi WON), `addOrderToDeal` (pesanan berikutnya untuk deal yang sudah WON, customer wajib sama), dan `createDirectOrder` (tanpa deal).
- **Amandemen pesanan** adalah delta nilai bertanda, append-only. Nilai berjalan = nilai awal + jumlah delta, dan tidak boleh di bawah total yang sudah ditagih.
- **Termin (`billing_items`)** adalah bagian nilai pesanan yang akan ditagih: label, jumlah, pemicu (`ON_ORDER`, `ON_DATE`, `ON_MILESTONE`), penanda retensi, dan bukti milestone (misalnya nomor BAST). Invariant: jumlah termin yang tidak batal = nilai berjalan pesanan. Rencana termin yang belum diinvoice boleh diubah (`rebalanceBillingItems`) selama jumlah total tetap.
- **Invoice** ditagihkan per termin dan **totalnya wajib sama persis dengan jumlah termin**. Tagih lebih kecil atau sebagian dilakukan dengan memecah termin; tagih lebih besar dengan amandemen. Tidak ada override nominal, sehingga "siap ditagih" dan "sudah ditagih" selalu tepat.
- **Void invoice** (bukan hapus): hanya bila tidak ada settlement aktif; nomor tidak dipakai ulang; termin kembali `READY`; boleh ada invoice pengganti.
- **Reopen WON** membatalkan pesanan deal itu dan hanya boleh bila tidak ada invoice non-void.
- `deals.won_value` = nilai pesanan pertama, dibekukan bersama `won_at`. Bookings dihitung dari pesanan dan amandemen, bukan dari deal, sehingga tidak ada penghitungan ganda.
- Status pesanan dan termin **turunan**: `ACTIVE`, `FULLY_BILLED`, `CLOSED`, `CANCELLED`; `PLANNED`, `READY`, `INVOICED`, `CANCELLED`.

## Alternatif yang ditolak

- **Entitas Agreement penuh seperti usulan GPT** dengan BillingPlan, Obligation, Evidence, FulfillmentProject, dan Milestone terpisah. Terlalu banyak entitas untuk tim 1-30 orang. Pesanan + termin menutup DP, termin, BAST, retensi, dan tagihan berkala manual tanpa modul project.
- **Banyak invoice per deal tanpa pesanan.** Tidak ada tempat untuk bukti komitmen, amandemen, dan invariant nilai.
- **Invoice dengan override nominal beralasan.** Memaksa aturan tambahan tentang efek selisih pada sisa termin dan status pesanan. Mengubah rencana lebih jelas dan diaudit.
- **Credit note.** Void + invoice pengganti cukup sampai ada pengguna yang menolak nomor invoice baru.

## Konsekuensi

- Unik `(organization_id, deal_id)` pada `invoices` dihapus; `invoices.billing_item_id` ditambahkan.
- Migrasi: setiap deal WON menjadi satu pesanan `LEGACY` dengan satu termin `ON_ORDER`. Invoice lama ditautkan ke termin itu; bila total invoice berbeda dari `won_value`, termin mengikuti total invoice dan selisihnya dicatat sebagai amandemen `LEGACY`. Tidak ada bukti yang dikarang.
- Test wajib: WON tanpa bukti ditolak; pesanan kedua ke deal WON; DP 30/40/30 dengan BAST; invoice berbeda dari termin ditolak; amandemen di bawah nilai tertagih ditolak; dua Finance menerbitkan invoice termin yang sama, satu kalah; pesanan langsung dengan invoice dan pembayaran dalam satu submit.
