import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows with CRLF line ends and a BOM", () => {
    expect(toCsv(["a", "b"], [["1", 2], ["x", null]])).toBe("﻿a,b\r\n1,2\r\nx,\r\n");
  });

  it("quotes commas, quotes and line breaks, doubling the quotes", () => {
    expect(toCsv(["n"], [["PT Maju, Jaya"], ['Dia bilang "ya"'], ["baris\nbaru"]])).toBe('﻿n\r\n"PT Maju, Jaya"\r\n"Dia bilang ""ya"""\r\n"baris\nbaru"\r\n');
  });

  it("defuses cells a spreadsheet would run as a formula", () => {
    const out = toCsv(["n"], [["=SUM(A1:A9)"], ["+62812"], ["-1"], ["@cmd"], ["\tTab"], ["biasa"]]);
    expect(out).toBe("﻿n\r\n'=SUM(A1:A9)\r\n'+62812\r\n'-1\r\n'@cmd\r\n'\tTab\r\nbiasa\r\n");
  });

  it("keeps a formula-looking cell quoted when it also needs quoting", () => {
    expect(toCsv(["n"], [['=HYPERLINK("x","y")']])).toBe('﻿n\r\n"\'=HYPERLINK(""x"",""y"")"\r\n');
  });

  it("writes only the header for no rows", () => {
    expect(toCsv(["a"], [])).toBe("﻿a\r\n");
  });
});
