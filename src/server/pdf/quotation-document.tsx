import { fileURLToPath } from "node:url";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatRupiah } from "@/server/money/amount";
import { formatQuantityForDisplay } from "@/server/money/quantity";
import type { CustomerSnapshot, SellerSnapshot } from "@/server/shared/document-snapshots";
import { formatIndonesianDate } from "./format-date";

// PDF-03: a bundled static font, not the library default (Helvetica) and
// not a variable font -- @react-pdf/renderer does not support OpenType
// variable fonts (PDF 2.0 spec limitation), which is exactly what the M0
// spike (renderer-compat.test.tsx) exists to keep proving on every CI run.
//
// Each font file gets its own literal `new URL('./file', import.meta.url)`
// expression rather than joining a directory URL with a filename via
// path.join: Turbopack statically scans source for exactly this literal
// pattern to bundle the referenced file as an asset (the same convention
// webpack uses). A directory reference or a runtime-built path (what the
// M0 spike itself uses, safe there only because that file is never
// imported by app code and so never goes through Next.js's own build)
// isn't recognized as an asset reference at all -- confirmed by this
// route's own production build failing on that exact pattern
// ("Module not found: Can't resolve './fonts'") before this fix.
Font.register({
  family: "Inter",
  fonts: [
    { src: fileURLToPath(new URL("./fonts/Inter-Regular.ttf", import.meta.url)), fontWeight: 400 },
    { src: fileURLToPath(new URL("./fonts/Inter-Bold.ttf", import.meta.url)), fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Inter", fontSize: 9.5, color: "#1a1a1a" },
  watermark: {
    position: "absolute",
    top: "42%",
    left: "12%",
    fontSize: 90,
    fontWeight: 700,
    color: "#e5433a",
    opacity: 0.14,
    transform: "rotate(-28deg)",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 12, marginBottom: 16 },
  sellerName: { fontSize: 15, fontWeight: 700, marginBottom: 3 },
  sellerLine: { fontSize: 9, color: "#555555", lineHeight: 1.4 },
  docTitleBlock: { alignItems: "flex-end" },
  docTitle: { fontSize: 17, fontWeight: 700, letterSpacing: 1 },
  docNumber: { fontSize: 10, color: "#555555", marginTop: 3 },
  docRevision: { fontSize: 8.5, color: "#888888", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  metaLabel: { fontSize: 8, color: "#888888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  customerBlock: { maxWidth: 260 },
  customerName: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  customerLine: { fontSize: 9, color: "#333333", lineHeight: 1.4 },
  datesBlock: { alignItems: "flex-end" },
  dateRow: { flexDirection: "row", marginBottom: 4 },
  dateValue: { fontSize: 9.5, fontWeight: 700 },

  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1a1a1a", paddingBottom: 5, marginBottom: 4 },
  headerCellDesc: { flex: 3, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  headerCellNum: { flex: 1, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0" },
  cellDesc: { flex: 3, fontSize: 9.5 },
  cellNum: { flex: 1, fontSize: 9.5, textAlign: "right" },

  totalsBlock: { alignSelf: "flex-end", width: 220, marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { fontSize: 9.5, color: "#555555" },
  totalsValue: { fontSize: 9.5 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#1a1a1a", marginTop: 5, paddingTop: 6 },
  grandTotalLabel: { fontSize: 10.5, fontWeight: 700 },
  grandTotalValue: { fontSize: 13, fontWeight: 700 },

  textBlock: { marginTop: 20 },
  textBlockLabel: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#888888", marginBottom: 3 },
  textBlockBody: { fontSize: 9, color: "#333333", lineHeight: 1.5 },

  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#999999" },
});

function dash(value: string | null): string {
  return value && value.trim() !== "" ? value : "-";
}

export type QuotationDocumentItem = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: bigint;
  subtotal: bigint;
};

export type QuotationDocumentProps = {
  quotationNumber: string;
  revisionNumber: number;
  status: string;
  issueDate: string;
  validUntil: string;
  seller: SellerSnapshot;
  customer: CustomerSnapshot;
  items: readonly QuotationDocumentItem[];
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
  notes: string | null;
  terms: string | null;
  /** The same layout serves invoices (INV-05): the title, the second date's label and the watermark change. */
  documentTitle?: string;
  secondDateLabel?: string;
  /** Overrides the DRAFT watermark: "VOID" on a voided invoice. */
  watermark?: string | null;
  /** The line under the number, replacing "Revisi ke-n". */
  subtitle?: string | null;
};

/**
 * PDF-01: renders every required field. PDF-02: this component never
 * decides frozen-vs-live content itself -- it only draws whatever
 * seller/customer/items it is given, which is the caller's job
 * (getQuotationForPdf) to have already resolved correctly.
 */
export function QuotationDocument(props: QuotationDocumentProps) {
  const watermark = props.watermark !== undefined ? props.watermark : props.status === "DRAFT" ? "DRAFT" : null;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {watermark && (
          <Text style={styles.watermark} fixed>
            {watermark}
          </Text>
        )}

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sellerName}>{dash(props.seller.name)}</Text>
            <Text style={styles.sellerLine}>{dash(props.seller.address)}</Text>
            <Text style={styles.sellerLine}>
              {dash(props.seller.contactEmail)} · {dash(props.seller.contactPhone)}
            </Text>
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>{props.documentTitle ?? "QUOTATION"}</Text>
            <Text style={styles.docNumber}>{props.quotationNumber}</Text>
            {props.subtitle !== undefined ? (
              props.subtitle && <Text style={styles.docRevision}>{props.subtitle}</Text>
            ) : (
              props.revisionNumber > 1 && <Text style={styles.docRevision}>Revisi ke-{props.revisionNumber - 1}</Text>
            )}
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.customerBlock}>
            <Text style={styles.metaLabel}>Kepada</Text>
            <Text style={styles.customerName}>{dash(props.customer.companyName)}</Text>
            <Text style={styles.customerLine}>{dash(props.customer.contactPerson)}</Text>
            <Text style={styles.customerLine}>{dash(props.customer.phone)}</Text>
            {props.customer.email && <Text style={styles.customerLine}>{props.customer.email}</Text>}
            {props.customer.address && <Text style={styles.customerLine}>{props.customer.address}</Text>}
            {props.customer.taxId && <Text style={styles.customerLine}>NPWP {props.customer.taxId}</Text>}
          </View>
          <View style={styles.datesBlock}>
            <View style={styles.dateRow}>
              <Text style={styles.metaLabel}>Tanggal Terbit: </Text>
            </View>
            <Text style={styles.dateValue}>{formatIndonesianDate(props.issueDate)}</Text>
            <View style={[styles.dateRow, { marginTop: 8 }]}>
              <Text style={styles.metaLabel}>{props.secondDateLabel ?? "Berlaku Sampai"}: </Text>
            </View>
            <Text style={styles.dateValue}>{formatIndonesianDate(props.validUntil)}</Text>
          </View>
        </View>

        {/* PDF-03: "header tabel berulang" -- fixed makes this row repeat
            identically on every page the item list spans. */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.headerCellDesc}>Deskripsi</Text>
          <Text style={styles.headerCellNum}>Qty</Text>
          <Text style={styles.headerCellNum}>Satuan</Text>
          <Text style={styles.headerCellNum}>Harga Satuan</Text>
          <Text style={styles.headerCellNum}>Subtotal</Text>
        </View>
        {/* PDF-03: no wrap={false} here. @react-pdf/renderer does not push a
            wrap={false} block taller than one page to the next page --  it
            clips it in place, silently truncating whatever didn't fit. A
            row's description is capped at 1000 characters (QUO-02) and
            currently always fits within one page at this layout's font
            size, but "tanpa terpotong" has to hold regardless of that
            limit, not by accident of today's numbers. */}
        {props.items.map((item, index) => (
          <View style={styles.row} key={index}>
            <Text style={styles.cellDesc}>{item.description}</Text>
            <Text style={styles.cellNum}>{formatQuantityForDisplay(item.quantity)}</Text>
            <Text style={styles.cellNum}>{item.unit}</Text>
            <Text style={styles.cellNum}>{formatRupiah(item.unitPrice)}</Text>
            <Text style={styles.cellNum}>{formatRupiah(item.subtotal)}</Text>
          </View>
        ))}

        {/* PDF-03: "total ... tanpa terpotong" -- wrap={false} keeps this
            block from being split across a page boundary; it moves to the
            next page whole if it doesn't fit on the current one. */}
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatRupiah(props.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Diskon</Text>
            <Text style={styles.totalsValue}>-{formatRupiah(props.discount)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Pajak</Text>
            <Text style={styles.totalsValue}>{formatRupiah(props.tax)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatRupiah(props.total)}</Text>
          </View>
        </View>

        {/* PDF-03: "total ... tanpa terpotong" also covers terms/notes, and
            each can run up to 10,000 characters (§8.1) -- far more than
            fits on one page. wrap={false} would clip whatever overflowed
            the current page instead of continuing it onto the next one, so
            these are left to wrap normally; only the small, always-bounded
            totals block above keeps wrap={false}. */}
        {props.terms && (
          <View style={styles.textBlock}>
            <Text style={styles.textBlockLabel}>Syarat &amp; Ketentuan</Text>
            <Text style={styles.textBlockBody}>{props.terms}</Text>
          </View>
        )}
        {props.notes && (
          <View style={styles.textBlock}>
            <Text style={styles.textBlockLabel}>Catatan</Text>
            <Text style={styles.textBlockBody}>{props.notes}</Text>
          </View>
        )}

        {/* PDF-03: document number and page number on every page. */}
        <View style={styles.footer} fixed>
          <Text>{props.quotationNumber}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Renders entirely in memory (OBS-04): never touches the filesystem. */
export function renderQuotationPdf(props: QuotationDocumentProps): Promise<Buffer> {
  return renderToBuffer(<QuotationDocument {...props} />);
}

export type InvoiceDocumentProps = Omit<QuotationDocumentProps, "quotationNumber" | "revisionNumber" | "status" | "validUntil" | "documentTitle" | "secondDateLabel" | "watermark" | "subtitle"> & {
  invoiceNumber: string;
  dueDate: string;
  voided: boolean;
  orderNumber: string;
};

/** INV-05: an invoice PDF through the same module; a voided invoice is marked VOID and nothing else changes. */
export function renderInvoicePdf(props: InvoiceDocumentProps): Promise<Buffer> {
  const { invoiceNumber, dueDate, voided, orderNumber, ...rest } = props;
  return renderQuotationPdf({
    ...rest,
    quotationNumber: invoiceNumber,
    revisionNumber: 1,
    status: "INVOICE",
    validUntil: dueDate,
    documentTitle: "INVOICE",
    secondDateLabel: "Jatuh Tempo",
    watermark: voided ? "VOID" : null,
    subtitle: `Pesanan ${orderNumber}`,
  });
}
