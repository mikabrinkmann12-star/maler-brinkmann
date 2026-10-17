import { describe, expect, it } from "vitest";
import { DATEI_MAX_BYTES, dateiPfad, dateiPruefen, endungVon, groesseText } from "./dateien";

describe("dateiPruefen", () => {
  it("erlaubt Dokumente, auch mit großer Endung", () => {
    expect(dateiPruefen("Plan.PDF", 1000)).toEqual({ ok: true, typ: "application/pdf", endung: "pdf" });
    expect(dateiPruefen("Liste.xlsx", 5)).toMatchObject({ ok: true, endung: "xlsx" });
    expect(dateiPruefen("a.b.docx", 5)).toMatchObject({ ok: true, endung: "docx" });
  });
  it("lehnt Bilder, Programme, fehlende Endung, leere und zu große Dateien ab", () => {
    expect(dateiPruefen("foto.jpg", 10).ok).toBe(false);
    expect(dateiPruefen("setup.exe", 10).ok).toBe(false);
    expect(dateiPruefen("ohne-endung", 10).ok).toBe(false);
    expect(dateiPruefen("leer.pdf", 0).ok).toBe(false);
    expect(dateiPruefen("riesig.pdf", DATEI_MAX_BYTES + 1).ok).toBe(false);
    expect(dateiPruefen("grenze.pdf", DATEI_MAX_BYTES).ok).toBe(true);
  });
});

describe("Hilfen", () => {
  it("endungVon und dateiPfad", () => {
    expect(endungVon("Datei.Name.PDF")).toBe("pdf");
    expect(endungVon("keine")).toBe("");
    expect(dateiPfad("p1", "d1", "pdf")).toBe("p1/d1.pdf");
  });
  it("groesseText", () => {
    expect(groesseText(12)).toBe("12 Byte");
    expect(groesseText(2048)).toBe("2 KB");
    expect(groesseText(1_572_864)).toBe("1,5 MB");
  });
});
