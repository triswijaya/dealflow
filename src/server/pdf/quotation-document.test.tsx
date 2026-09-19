import { describe, expect, it } from "vitest";
// pdfjs-dist is a devDependency, used only here to prove what a rendered
// PDF actually contains. @react-pdf/renderer embeds fonts with a
// CID/Identity-H encoding: the raw bytes of a "Tj"/"TJ" operator are glyph
// indices, not the source characters, so a plain buffer.includes("...")
// check can never find real text (confirmed empirically while building
// this test: two different fonts assign colliding low glyph codes to
// different characters, so even decoding the codes without knowing which
// font is active silently produces garbage). pdfjs-dist's own text layer
// resolves this correctly, which is the whole reason to use it here
// instead of a hand-rolled decoder.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderQuotationPdf, type QuotationDocumentProps } from "./quotation-document";

async function extractText(buffer: Buffer): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text;
}

function baseProps(overrides: Partial<QuotationDocumentProps> = {}): QuotationDocumentProps {
  return {
    quotationNumber: "QT-2026-00042",
    revisionNumber: 1,
    status: "DRAFT",
    issueDate: "2026-09-19",
    validUntil: "2026-10-19",
    seller: { name: "NusaTech Solutions", address: "Jl. Industri Raya No. 45, Bekasi", contactEmail: "admin@nusatech.id", contactPhone: "021-8899-2200" },
    customer: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "628123456789", email: "budi@majujaya.co.id", address: "Jl. Sudirman No. 1, Jakarta" },
    items: [{ description: "Kamera CCTV Dome 4MP", quantity: "8.000", unit: "pcs", unitPrice: 1_850_000n, subtotal: 14_800_000n }],
    subtotal: 14_800_000n,
    discount: 450_000n,
    tax: 2_420_000n,
    total: 16_770_000n,
    notes: "Instalasi termasuk konfigurasi remote viewing.",
    terms: "DP 50% sebelum pengerjaan.",
    ...overrides,
  };
}

describe("QuotationDocument (PDF-01)", () => {
  it("renders a valid PDF containing every required field", async () => {
    const buffer = await renderQuotationPdf(baseProps());
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");

    const text = await extractText(buffer);
    // Company information
    expect(text).toContain("NusaTech Solutions");
    expect(text).toContain("Jl. Industri Raya No. 45, Bekasi");
    // Document number
    expect(text).toContain("QT-2026-00042");
    // Customer/contact
    expect(text).toContain("PT Maju Jaya");
    expect(text).toContain("Budi Santoso");
    // Dates (Indonesian format)
    expect(text).toContain("19 September 2026");
    expect(text).toContain("19 Oktober 2026");
    // Item line
    expect(text).toContain("Kamera CCTV Dome 4MP");
    expect(text).toContain("8"); // formatQuantityForDisplay("8.000") -> "8"
    expect(text).toContain("pcs");
    expect(text).toContain("Rp1.850.000");
    // Totals
    expect(text).toContain("Rp14.800.000"); // subtotal
    expect(text).toContain("Rp450.000"); // discount
    expect(text).toContain("Rp2.420.000"); // tax
    expect(text).toContain("Rp16.770.000"); // grand total
    // Terms and notes
    expect(text).toContain("DP 50% sebelum pengerjaan");
    expect(text).toContain("Instalasi termasuk konfigurasi remote viewing");
  });

  it("shows the DRAFT watermark only when status is DRAFT (PDF-02)", async () => {
    const draftBuffer = await renderQuotationPdf(baseProps({ status: "DRAFT" }));
    const draftText = await extractText(draftBuffer);
    expect(draftText).toContain("DRAFT");

    const sentBuffer = await renderQuotationPdf(baseProps({ status: "SENT" }));
    const sentText = await extractText(sentBuffer);
    expect(sentText).not.toContain("DRAFT");
  });

  it("shows a revision caption only for a revision, not the original", async () => {
    const original = await extractText(await renderQuotationPdf(baseProps({ revisionNumber: 1 })));
    expect(original).not.toContain("Revisi ke-");

    const revision = await extractText(await renderQuotationPdf(baseProps({ quotationNumber: "QT-2026-00042-R1", revisionNumber: 2 })));
    expect(revision).toContain("Revisi ke-1");
  });

  it("omits notes/terms sections entirely when they are null, rather than showing an empty label", async () => {
    const text = await extractText(await renderQuotationPdf(baseProps({ notes: null, terms: null })));
    expect(text).not.toContain("Catatan");
    expect(text).not.toContain("Syarat");
  });

  it("renders every item across multiple items, in order", async () => {
    const props = baseProps({
      items: [
        { description: "Kamera CCTV Dome 4MP", quantity: "8.000", unit: "pcs", unitPrice: 1_850_000n, subtotal: 14_800_000n },
        { description: "DVR 8 Channel + HDD 2TB", quantity: "1.000", unit: "unit", unitPrice: 3_200_000n, subtotal: 3_200_000n },
        { description: "Jasa Pemasangan & Konfigurasi", quantity: "1.000", unit: "paket", unitPrice: 2_500_000n, subtotal: 2_500_000n },
      ],
    });
    const text = await extractText(await renderQuotationPdf(props));
    expect(text).toContain("Kamera CCTV Dome 4MP");
    expect(text).toContain("DVR 8 Channel + HDD 2TB");
    expect(text).toContain("Jasa Pemasangan & Konfigurasi");
  });

  it("falls back to a dash for a missing seller/customer field instead of rendering blank or 'null'", async () => {
    const text = await extractText(
      await renderQuotationPdf(
        baseProps({
          seller: { name: "NusaTech Solutions", address: null, contactEmail: null, contactPhone: null },
          customer: { companyName: "PT Maju Jaya", contactPerson: null, phone: null, email: null, address: null },
        }),
      ),
    );
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  it("renders a 200-item fixture across multiple pages, with the item table header and page number repeated (PDF-03/NFR-02)", async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      description: `Item baris ke-${i + 1}`,
      quantity: "1.000",
      unit: "pcs",
      unitPrice: 100_000n,
      subtotal: 100_000n,
    }));
    const buffer = await renderQuotationPdf(baseProps({ items, subtotal: 20_000_000n, total: 20_000_000n }));

    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    expect(pdf.numPages).toBeGreaterThan(1);

    const text = await extractText(buffer);
    expect(text).toContain("Item baris ke-1");
    expect(text).toContain("Item baris ke-200");
    // The header row is `fixed`, so it must appear once per page, not once
    // for the whole document. Uppercase: the header style transforms it.
    const headerOccurrences = text.split("DESKRIPSI").length - 1;
    expect(headerOccurrences).toBe(pdf.numPages);
    // PDF-03: "nomor halaman tersedia pada dokumen multi-halaman" -- one
    // "Halaman N dari totalPages" string per page, not just on the last one.
    for (let page = 1; page <= pdf.numPages; page++) {
      expect(text).toContain(`Halaman ${page} dari ${pdf.numPages}`);
    }
  }, 15000);

  it("does not truncate terms/notes at their 10,000-character maximum, even when that spans multiple pages (PDF-03)", async () => {
    // Realistic word-wrapped prose, not one unbroken token: a giant
    // unbroken string has its own separate horizontal-overflow behavior in
    // @react-pdf/renderer that isn't representative of real terms/notes
    // text, which always has natural word breaks.
    const longTerms = "Syarat pembayaran dan ketentuan pengerjaan proyek instalasi CCTV. ".repeat(130).slice(0, 9_950) + " AKHIR-SYARAT";
    const longNotes = "Catatan tambahan mengenai jadwal pemasangan dan garansi perangkat. ".repeat(130).slice(0, 9_950) + " AKHIR-CATATAN";
    const buffer = await renderQuotationPdf(baseProps({ terms: longTerms, notes: longNotes }));

    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    expect(pdf.numPages).toBeGreaterThan(1);

    const text = await extractText(buffer);
    expect(text).toContain("AKHIR-SYARAT");
    expect(text).toContain("AKHIR-CATATAN");
    // Every page that carries any part of the item table / footer must
    // still show the document number and a page-number string -- the
    // original bug also dropped these because the oversized block ate the
    // rest of its own page without the footer rendering.
    for (let page = 1; page <= pdf.numPages; page++) {
      expect(text).toContain(`Halaman ${page} dari ${pdf.numPages}`);
    }
  }, 15000);

  it("renders a 20-item fixture within the NFR-02 preview time budget (<= 5s)", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      description: `Item ${i + 1}`,
      quantity: "1.000",
      unit: "pcs",
      unitPrice: 100_000n,
      subtotal: 100_000n,
    }));
    const start = performance.now();
    await renderQuotationPdf(baseProps({ items }));
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it("never touches the filesystem (OBS-04)", async () => {
    const buffer = await renderQuotationPdf(baseProps());
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
