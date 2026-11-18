import { describe, expect, it } from "vitest";
import { DATEV_STANDARD, belegtransferDocumentXml, datevAusJson, datevCsv, debitorenCsv, gegenKonto, journalCsv, type JournalZeile } from "./steuerberater-export";

// Konten nach den Angaben der Steuerberaterin (12.11.2026, SKR03)
const z = (teil: Partial<JournalZeile> = {}): JournalZeile => ({
  nummer: "R-2026-0001", art: "rechnung", datum: "2026-11-12", leistungVon: "2026-11-01", leistungBis: "2026-11-10", kunde: "Anna Muster", kundennummer: "KD-1", projektnummer: "P-1", betreff: "Innenanstrich",
  netto: 100, brutto: 119, steuersatz: 19, reverseCharge: false, status: "offen", bezahltAm: null, bezugNummer: "", abzugBrutto: 0, anbieter: "eigen", ...teil,
});

describe("Konten der Steuerberaterin", () => {
  it("Standardwerte: Erlöse 8400/8300, 13b 8337, Abschläge 1718/1719, Schluss 1590", () => {
    expect(DATEV_STANDARD).toMatchObject({ erloes19: 8400, erloes7: 8300, erloesReverseCharge: 8337, abschlag19: 1718, abschlagReverseCharge: 1719, schluss: 1590 });
    expect(datevAusJson({ abschlag19: 1700, schluss: 1591 })).toMatchObject({ abschlag19: 1700, schluss: 1591, abschlagReverseCharge: 1719 });
  });

  it("Gegenkonto nach Art und Steuer", () => {
    const e = DATEV_STANDARD;
    expect(gegenKonto(z(), e)).toBe(8400);
    expect(gegenKonto(z({ steuersatz: 7 }), e)).toBe(8300);
    expect(gegenKonto(z({ reverseCharge: true, steuersatz: 0 }), e)).toBe(8337);
    expect(gegenKonto(z({ art: "abschlag" }), e)).toBe(1718);
    expect(gegenKonto(z({ art: "abschlag", reverseCharge: true, steuersatz: 0 }), e)).toBe(1719);
    expect(gegenKonto(z({ art: "abschlag", steuersatz: 7 }), e)).toBe(1711);
    expect(gegenKonto(z({ art: "schluss" }), e)).toBe(1590);
    expect(gegenKonto(z({ art: "schluss", reverseCharge: true, steuersatz: 0 }), e)).toBe(1590);
  });

  it("Buchung auf das Konto des Kunden, ohne Konto auf den Sammeldebitor", () => {
    const e = { ...DATEV_STANDARD, berater: 437518, mandant: 18751 };
    const zeilen = datevCsv([z({ debitor: 10042 }), z({ nummer: "R-2026-0002", debitor: null, art: "abschlag" })], e, { von: "2026-11-01", bis: "2026-11-30" }).trim().split("\r\n");
    expect(zeilen[0]).toContain(";437518;18751;");
    expect(zeilen[2]).toContain(";10042;8400;");
    expect(zeilen[3]).toContain(";10000;1718;");
    expect(journalCsv([z({ debitor: 10042 })])).toContain(";KD-1;10042;");
  });

  it("Kundenliste im DATEV-Format: Firma und Privatperson, USt-IdNr. getrennt", () => {
    const csv = debitorenCsv([
      { debitor: 10002, firma: false, firmenname: "", vorname: "Anna", nachname: "Müller", kundennummer: "KD-2", strasse: "Weg 1", plz: "26683", ort: "Saterland", land: "Deutschland", ustId: "" },
      { debitor: 10001, firma: true, firmenname: "Wallschlag GmbH", vorname: "", nachname: "", kundennummer: "KD-1", strasse: "Dreschenweg 1", plz: "26683", ort: "Saterland", land: "Deutschland", ustId: "DE 288936236" },
    ], { ...DATEV_STANDARD, berater: 437518, mandant: 18751 }, new Date("2026-11-12T10:00:00Z"));
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen[0].startsWith('"EXTF";510;16;"Debitoren/Kreditoren";5;')).toBe(true);
    expect(zeilen[0]).toContain(";437518;18751;20260101;4;");
    expect(zeilen[2].startsWith('10001;"Wallschlag GmbH";"";"";"";"";2;')).toBe(true);
    expect(zeilen[2]).toContain(';"DE";"288936236";');
    expect(zeilen[3].startsWith('10002;"";"";"Mueller";"Anna";"";1;')).toBe(true);
    expect(zeilen[3].endsWith('"Weg 1";"";"26683";"Saterland";"DE"')).toBe(true);
  });
});

describe("Antworten der Steuerberaterin vom 18.11.2026", () => {
  it("Abschlag 7 % auf 1711, Schlussrechnung mit Gesamtbetrag inklusive Abschlägen", () => {
    expect(DATEV_STANDARD.abschlag7).toBe(1711);
    expect(gegenKonto(z({ art: "abschlag", steuersatz: 7 }), DATEV_STANDARD)).toBe(1711);
    const zeilen = datevCsv([z({ art: "schluss", netto: 400, brutto: 476, abzugBrutto: 1190 })], DATEV_STANDARD, { von: "2026-11-01", bis: "2026-11-30" }).trim().split("\r\n");
    expect(zeilen[2].startsWith("1666,00;")).toBe(true);
    expect(zeilen[2]).toContain(";1590;");
  });

  it("Beleglink im Buchungsstapel und document.xml mit derselben GUID", () => {
    const guid = "3f2b1c4d-1111-4222-8333-944455556666";
    const zeilen = datevCsv([z({ beleg: guid }), z({ nummer: "R-3000" })], DATEV_STANDARD, { von: "2026-11-01", bis: "2026-11-30" }).trim().split("\r\n");
    expect(zeilen[1].endsWith('"Zinssperre";"Beleglink"')).toBe(true);
    expect(zeilen[1].split(";")).toHaveLength(20);
    expect(zeilen[2].endsWith(`;"BEDI ""${guid}"""`)).toBe(true);
    expect(zeilen[2].split(";")).toHaveLength(20);
    expect(zeilen[3].endsWith(";")).toBe(true);
    const xml = belegtransferDocumentXml([{ guid, dateien: ["R-2026-0001.pdf", "R-2026-0001.xml"], datum: "2026-11-12" }], new Date("2026-11-18T10:00:00Z"), "Maler & Co");
    expect(xml).toContain('xmlns="http://xml.datev.de/bedi/tps/document/v06.0"');
    expect(xml).toContain('version="6.0" generatingSystem="Maler &amp; Co"');
    expect(xml).toContain("<date>2026-11-18T10:00:00</date>");
    expect(xml).toContain(`<document guid="${guid}" processID="2">`);
    expect(xml).toContain('<extension xsi:type="File" name="R-2026-0001.pdf"/>');
    expect(xml).toContain('<extension xsi:type="File" name="R-2026-0001.xml"/>');
    expect(xml).toContain('<level id="3" name="2026/11"/>');
  });
});
