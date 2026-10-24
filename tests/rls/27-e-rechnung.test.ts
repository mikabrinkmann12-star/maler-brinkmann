// E-Rechnung: das PDF bekommt das XML als Anhang „factur-x.xml“ (ZUGFeRD/Factur-X), der Rest des PDFs bleibt gleich. Mahn-PDF und Rechnungs-PDF
// laufen hier mit, weil die RLS-Konfiguration das „server-only“-Paket ersetzt (die Module dürfen dort geladen werden).
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfMitXml } from "@/lib/e-rechnung-daten";
import { FIRMA_LEER } from "@/lib/firma";
import { mahnungPdf } from "@/lib/mahnung-pdf";

async function einfachesPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText("Rechnung R-2026-0001");
  return doc.save();
}

describe("pdfMitXml", () => {
  it("hängt das XML als factur-x.xml an, ohne das PDF unlesbar zu machen", async () => {
    const original = await einfachesPdf();
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice>ÄÖÜ</rsm:CrossIndustryInvoice>';
    const hybrid = await pdfMitXml(original, xml);
    const doc = await PDFDocument.load(hybrid);
    expect(doc.getPageCount()).toBe(1);
    const text = Buffer.from(hybrid).toString("latin1");
    expect(text).toContain("factur-x.xml");
    expect(text).toContain("/AFRelationship");
    expect(hybrid.length).toBeGreaterThan(original.length);
  });
});

describe("mahnungPdf", () => {
  const firma = { ...FIRMA_LEER, name: "Maler Betrieb Brinkmann", strasse: "Zur Ziegelei 18", plz: "26683", ort: "Saterland", ustid: "DE292718369", iban: "DE74280652860401694705" };
  const daten = {
    firma, empfaenger: "Anna Muster\nHauptstraße 12\n26683 Saterland", kundennummer: "KD-1", stufeName: "1. Mahnung", datum: "2026-10-24", rechnungsnummer: "R-2026-0001",
    rechnungsdatum: "2026-09-01", betreff: "Innenanstrich", frist: "2026-10-31", text: "Sehr geehrte Damen und Herren,\n\nbitte zahlen Sie.", zinsenProzent: 9, tageUeberfaellig: 30,
    betraege: { offen: 1548.31, gebuehr: 3, zinsen: 11.45, summe: 1562.76 },
  };

  it("erzeugt ein gültiges PDF mit Titel, auch mit sehr langem Text über mehrere Seiten", async () => {
    const bytes = await mahnungPdf(daten);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain("1. Mahnung zur Rechnung R-2026-0001");
    const lang = await mahnungPdf({ ...daten, text: Array.from({ length: 80 }, (_, i) => `Absatz ${i + 1} mit etwas Text, der in die Zeile passt.`).join("\n") });
    expect((await PDFDocument.load(lang)).getPageCount()).toBeGreaterThan(1);
  });

  it("ohne Gebühr, Zinsen und Frist bricht nichts ab", async () => {
    const bytes = await mahnungPdf({ ...daten, frist: "", stufeName: "Zahlungserinnerung", betraege: { offen: 100, gebuehr: 0, zinsen: 0, summe: 100 }, zinsenProzent: 0, tageUeberfaellig: 0 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
