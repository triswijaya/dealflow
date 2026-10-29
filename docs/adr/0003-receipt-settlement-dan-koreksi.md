# ADR-0003: Receipt, settlement, dan koreksi uang append-only

- **Status:** Diterima, 29 Oktober 2026
- **Menggantikan:** PAY-01, PAY-02, PAY-05, ketentuan "Overpayment" dan "Koreksi finansial" pada versi 1.2
- **Terkait:** ADR-0002

## Konteks

Versi 1.2 mencatat `payments` sebagai baris yang selalu menempel pada satu invoice, tidak bisa dikoreksi, dan menolak kelebihan bayar. Praktik B2B menyimpang dari itu:

- Satu transfer melunasi dua invoice; dua transfer melunasi satu invoice.
- Uang muka masuk sebelum invoice ada.
- Transfer masuk tanpa keterangan, customer belum dikenali.
- Customer membayar bersih setelah potongan PPh 23; invoice tampak belum lunas selamanya.
- Selisih kecil karena biaya transfer.
- Transfer ternyata gagal, salah alokasi, atau uang dikembalikan.

Tanpa jalur koreksi, satu salah ketik memerlukan skrip operator (OPS-04).

## Keputusan

Pisahkan **uang masuk** dari **pelunasan klaim**.

- **Receipt**: uang yang benar-benar masuk (`amount`, `received_on`, `method`, `reference`). `customer_id` boleh kosong untuk transfer yang belum dikenali; **identifikasi** menetapkan customer satu kali, dengan catatan dasar pengenalan, dan diaudit.
- **Settlement**: bagian yang melunasi satu invoice, berjenis `RECEIPT` (dari receipt), `WITHHOLDING` (potongan pajak oleh customer, wajib nomor bukti potong), atau `WRITE_OFF` (selisih kecil, wajib catatan, dibatasi nominal di settings). Customer receipt dan invoice harus sama.
- **Refund**: uang dikembalikan dari sisa receipt, tidak melebihi sisa.
- **Koreksi**: `reverse` untuk settlement dan receipt, `void` untuk invoice (ADR-0002). Tidak ada update atau delete. Receipt tidak bisa di-reverse selama masih punya settlement aktif.
- **Jalur umum tetap satu langkah:** "Catat pembayaran" dari halaman invoice membuat receipt dan settlement dalam satu transaksi.

Invariant (dijaga di bawah lock dan diperiksa oleh `pnpm reconcile`):

```text
receipt_available = receipt.amount - settlement RECEIPT aktif - refund   >= 0
invoice_remaining = invoice.total - settlement aktif (semua jenis)       >= 0
customer_credit   = jumlah receipt_available receipt aktif customer
cash_received     = receipt aktif - refund   (WITHHOLDING dan WRITE_OFF bukan kas)
```

Urutan lock tetap: deal, pesanan, termin, invoice, receipt; beberapa baris sejenis dikunci menurut id.

## Alternatif yang ditolak

- **Alokasi pembayaran many-to-many dengan AdvanceApplication, ReceiptAdjustment, CustomerCredit sebagai entitas** (usulan GPT). `settlements` sudah many-to-many (satu receipt ke banyak invoice, satu invoice dari banyak receipt). Uang muka adalah receipt tanpa settlement; kredit customer adalah sisa receipt yang diturunkan.
- **Konfirmasi receipt dua langkah (pending/verified).** Ditunda sampai ada organisasi yang memisahkan kasir dan finance.
- **Menyimpan status atau saldo invoice.** Tetap diturunkan saat baca dari fakta, agar kebenaran tidak bergantung pada cron atau cache.
- **Credit note dan dispute.** Ditunda dengan pemicu tertulis di arsitektur.

## Konsekuensi

- `payments` dimigrasi satu-ke-satu menjadi satu receipt dan satu settlement `RECEIPT` (id, tanggal, dan pembuat dipertahankan), lalu tabel lama dihapus.
- Kelebihan bayar tidak lagi ditolak: sisanya menjadi kredit customer.
- Status invoice (urutan): `VOID`, `PAID`, `OVERDUE`, `PARTIALLY_PAID`, `UNPAID`.
- Test wajib: satu transfer ke dua invoice, dua transfer ke satu invoice, kelebihan bayar, DP sebelum invoice lalu dialokasikan, bayar bersih dengan PPh melunasi tanpa menambah kas, reversal membuka kembali saldo, alokasi bersamaan tidak memakai sisa receipt dua kali, refund melebihi sisa ditolak, migrasi payment mempertahankan total piutang.
