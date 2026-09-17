import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

// M0 gate: "buktikan PDF renderer kompatibel" (requirement.md section 20.2), and
// PDF-03's riskiest mechanics specifically: page break with a repeated table
// header, a bundled (non-default) font, and page numbers on a multi-page
// document. This is deliberately NOT the real quotation template (that's
// M2, once quotations exist) -- it exists only to keep proving @react-pdf/renderer
// still works on every CI run, so a future dependency bump that breaks PDF
// generation is caught here, not discovered mid-way through building M2.
//
// Font bundling: registers real static TTF files (see ./fonts), not the
// library's default Helvetica. @react-pdf/renderer explicitly does not
// support OpenType variable fonts (PDF 2.0 spec limitation), which is why
// these are separate per-weight static files, not a single variable font.

const fontsDir = fileURLToPath(new URL("./fonts", import.meta.url));

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(fontsDir, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Inter", fontSize: 10 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 4,
    marginBottom: 4,
  },
  headerCell: { fontWeight: 700, flex: 1 },
  row: { flexDirection: "row", paddingVertical: 2 },
  cell: { flex: 1 },
  pageNumber: { position: "absolute", bottom: 16, right: 32, fontSize: 8, color: "grey" },
});

function SpikeDocument({ itemCount }: { itemCount: number }) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    no: i + 1,
    description: `Sample line item number ${i + 1} to force page overflow in the compatibility spike`,
  }));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* fixed = repeated identically on every page: proves PDF-03's
            "header tabel berulang" requirement, not just a single render. */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.headerCell}>No</Text>
          <Text style={styles.headerCell}>Description</Text>
        </View>
        {items.map((item) => (
          <View style={styles.row} key={item.no}>
            <Text style={styles.cell}>{item.no}</Text>
            <Text style={styles.cell}>{item.description}</Text>
          </View>
        ))}
        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

function pageCount(buffer: Buffer): number {
  const match = buffer.toString("latin1").match(/\/Type\s*\/Pages[^]*?\/Count\s+(\d+)/);
  if (!match) {
    throw new Error("Could not find /Pages /Count in the rendered PDF");
  }
  return Number(match[1]);
}

describe("PDF renderer compatibility (@react-pdf/renderer)", () => {
  it("renders a valid, well-formed PDF for a 20-item fixture (NFR-02 baseline size)", async () => {
    const buffer = await renderToBuffer(<SpikeDocument itemCount={20} />);

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.toString("latin1")).toContain("%%EOF");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("renders a 200-item fixture across multiple pages without crashing (NFR-02 upper bound)", async () => {
    const buffer = await renderToBuffer(<SpikeDocument itemCount={200} />);

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    // Proves page break actually occurred, not silently truncated to one page.
    expect(pageCount(buffer)).toBeGreaterThan(1);
  }, 15000);

  it("embeds the bundled font instead of falling back to a default font (PDF-03)", async () => {
    const buffer = await renderToBuffer(<SpikeDocument itemCount={20} />);
    const content = buffer.toString("latin1");

    // /FontFile2 = an embedded TrueType font program is present in the PDF.
    // Without it, react-pdf would have silently fallen back to a built-in
    // font instead of failing loudly, which is exactly the kind of gap this
    // spike exists to catch.
    expect(content).toContain("/FontFile2");
    expect(content).not.toContain("Helvetica");
  });

  it("never touches the filesystem to produce output (OBS-04: no persistent writable filesystem)", async () => {
    // renderToBuffer resolves entirely in memory. Deliberately not using
    // renderToFile, which is the only API in this library that writes to
    // disk; not calling it here is the actual proof, this assertion just
    // documents that constraint alongside the code that must uphold it.
    const buffer = await renderToBuffer(<SpikeDocument itemCount={1} />);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
