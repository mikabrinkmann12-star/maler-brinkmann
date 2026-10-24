import { describe, expect, it } from "vitest";
import { DATEV_STANDARD, datevAusJson, datevCsv, erloesKonto, inTeile, journalCsv, vorigerMonat, zeitraumLesen, type JournalZeile } from "./steuerberater-export";

const z = (teil: Partial<JournalZeile> = {}): JournalZeile => ({
  nummer: "R-2026-0001", art: "rechnung", datum: "2026-10-24", leistungVon: "2026-10-12", leistungBis: "2026-10-23", kunde: "Anna Muster", kundennummer: "KD-1", projektnummer: "P-1", betreff: "Innenanstrich",
  netto: 1301.1, brutto: 1548.31, steuersatz: 19, reverseCharge: false, status: "offen", bezahltAm: null, bezugNummer: "", abzugBrutto: 0, anbieter: "eigen", ...teil,
});

describe("journalCsv", () => {
  it("Kopf, Zeilen mit deutschen Zahlen und Datum, Summenzeile", () => {
    const csv = journalCsv([z(), z({ nummer: "G-2026-0001", art: "storno", datum: "2026-10-25", netto: -1301.1, brutto: -1548.31, bezugNummer: "R-2026-0001", status: "bezahlt", bezahltAm: "2026-10-25" })]);
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen).toHaveLength(4);
    expect(zeilen[0].startsWith("Rechnungsnummer;Art;Datum")).toBe(true);
    expect(zeilen[1]).toContain("R-2026-0001;Rechnung;24.10.2026;12.10.2026;23.10.2026;Anna Muster");
    expect(zeilen[1]).toContain(";1301,10;19;247,21;1548,31;nein;0,00;offen;;;App");
    expect(zeilen[2]).toContain("Stornorechnung");
    expect(zeilen[2]).toContain(";-1301,10;19;-247,21;-1548,31;");
    expect(zeilen[3].startsWith("Summe;")).toBe(true);
    expect(zeilen[3]).toContain(";0,00;;0,00;0,00;");
  });
  it("sortiert nach Datum und schützt vor Excel-Formeln und Semikolons im Text", () => {
    const csv = journalCsv([z({ nummer: "R-2", datum: "2026-10-30" }), z({ nummer: "R-1", datum: "2026-10-01", betreff: "=1+1; \"x\"" })]);
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen[1].startsWith("R-1;")).toBe(true);
    expect(zeilen[1]).toContain("\"'=1+1; \"\"x\"\"\"");
  });
  it("Reverse-Charge: Satz 0", () => {
    expect(journalCsv([z({ reverseCharge: true, steuersatz: 0, brutto: 1301.1 })])).toContain(";1301,10;0;0,00;1301,10;ja;");
  });
});

describe("DATEV", () => {
  const e = { ...DATEV_STANDARD, berater: 29098, mandant: 55003 };
  const jetzt = new Date("2026-10-24T12:30:45Z");
  it("Kopfzeile, Spaltenüberschriften und eine Buchung je Rechnung", () => {
    const csv = datevCsv([z(), z({ nummer: "G-2026-0001", art: "gutschrift", datum: "2026-10-25", netto: -100, brutto: -119, kunde: "Müller & Söhne" })], e, { von: "2026-10-01", bis: "2026-10-31" }, jetzt);
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen).toHaveLength(4);
    expect(zeilen[0].startsWith('"EXTF";510;21;"Buchungsstapel";7;20261024123045000;')).toBe(true);
    expect(zeilen[0]).toContain(";29098;55003;20260101;4;20261001;20261031;");
    expect(zeilen[1].startsWith('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen"')).toBe(true);
    expect(zeilen[2]).toBe('1548,31;"S";"EUR";;;;10000;8400;;2410;"R-2026-0001";;;"Rechnung Anna Muster Innenanstrich"');
    // Gutschrift: Haben, positiver Betrag, Umlaute raus
    expect(zeilen[3].startsWith('119,00;"H";"EUR"')).toBe(true);
    expect(zeilen[3]).toContain("Gutschrift Mueller & Soehne");
  });
  it("buchte stornierte Rechnungen aus Lexware/sevdesk nicht (kein Storno-Beleg), eigene schon (der Storno-Beleg gleicht aus)", () => {
    const csv = datevCsv(
      [z({ nummer: "RE1", anbieter: "lexware", status: "storniert" }), z({ nummer: "R-2026-0002", status: "storniert" }), z({ nummer: "G-2026-0001", art: "storno", brutto: -1548.31, netto: -1301.1 })],
      e, { von: "2026-10-01", bis: "2026-10-31" }, jetzt,
    );
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen).toHaveLength(4);
    expect(zeilen.join("\n")).not.toContain('"RE1"');
    expect(zeilen.some((s) => s.includes('"H"') && s.includes('"G-2026-0001"'))).toBe(true);
  });
  it("Erlöskonto nach Steuersatz", () => {
    expect(erloesKonto({ steuersatz: 19, reverseCharge: false }, DATEV_STANDARD)).toBe(8400);
    expect(erloesKonto({ steuersatz: 7, reverseCharge: false }, DATEV_STANDARD)).toBe(8300);
    expect(erloesKonto({ steuersatz: 0, reverseCharge: false }, DATEV_STANDARD)).toBe(8200);
    expect(erloesKonto({ steuersatz: 0, reverseCharge: true }, DATEV_STANDARD)).toBe(8337);
  });
  it("Einstellungen aus der Datenbank mit Rückfall auf die Standardwerte", () => {
    expect(datevAusJson({ berater: 1, mandant: 2, erloes19: 8401 })).toMatchObject({ berater: 1, mandant: 2, erloes19: 8401, erloes7: 8300, debitor: 10000 });
    expect(datevAusJson(null)).toEqual(DATEV_STANDARD);
    expect(datevAusJson({ berater: "x", mandant: -5 })).toMatchObject({ berater: 0, mandant: 0 });
  });
});

describe("Zeitraum und Teile", () => {
  it("liest nur gültige Zeiträume", () => {
    expect(zeitraumLesen("2026-10-01", "2026-10-31")).toEqual({ von: "2026-10-01", bis: "2026-10-31" });
    expect(zeitraumLesen("2026-10-31", "2026-10-01")).toBeNull();
    expect(zeitraumLesen("heute", "2026-10-01")).toBeNull();
    expect(zeitraumLesen("2020-01-01", "2026-12-31")).toBeNull();
    expect(zeitraumLesen(null, null)).toBeNull();
  });
  it("voriger Monat, auch über den Jahreswechsel", () => {
    expect(vorigerMonat("2026-10-24")).toEqual({ von: "2026-09-01", bis: "2026-09-30" });
    expect(vorigerMonat("2026-01-05")).toEqual({ von: "2025-12-01", bis: "2025-12-31" });
    expect(vorigerMonat("2026-03-10")).toEqual({ von: "2026-02-01", bis: "2026-02-28" });
  });
  it("Teile fester Größe", () => {
    expect(inTeile([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inTeile([], 3)).toEqual([]);
  });
});
