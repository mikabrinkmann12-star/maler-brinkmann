import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { angebotBerechnen, REVERSE_CHARGE_TEXT, STANDARD_EINLEITUNG, STANDARD_SCHLUSSTEXT, type Baustein } from "./angebot";
import { angebotPdf, type AngebotPdfDaten } from "./angebot-pdf";
import type { Firma } from "./firma";

const firma: Firma = {
  name: "Maler Betrieb Brinkmann", inhaber: "Ralf Brinkmann", strasse: "Zur Ziegelei 18", plz: "26683", ort: "Saterland",
  telefon: "04492/708108", email: "info@maler-brinkmann.de", website: "", ustid: "DE292718369", steuernummer: "56/106/09816",
  bank: "Raiffeisenbank eG Scharrel", iban: "DE74280652860401694705", bic: "GENODEF1SAN", logo: "",
};

let n = 0;
const pos = (kurz: string, menge: number, einheit: string, preis: number, lang = ""): Baustein => ({
  id: `p${++n}`, typ: "position", kurztext: kurz, langtext: lang, menge, einheit, einzelpreis: preis, bildPfad: null,
});
const andere = (typ: Baustein["typ"], teil: Partial<Baustein> = {}): Baustein => ({
  id: `x${++n}`, typ, kurztext: "", langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null, ...teil,
});

function daten(bausteine: Baustein[], teil: Partial<AngebotPdfDaten> = {}, rechnung = { rabattProzent: 0, steuersatz: 0, reverseCharge: true }): AngebotPdfDaten {
  return {
    firma, status: "entwurf", datum: "2024-07-10", betreff: "Technologiepark Etage EG, Haus 2, Holger Boers",
    leistungsort: "Technologiepark 10, 26129 Oldenburg", empfaenger: "Paul Rolfes Bauunternehmen\nPostdamm 19\n49624 Löningen",
    einleitung: STANDARD_EINLEITUNG, schlusstext: STANDARD_SCHLUSSTEXT, kundennummer: "19-1296-KD", projektnummer: "P-00108",
    berechnung: angebotBerechnen(bausteine, rechnung), reverseChargeText: REVERSE_CHARGE_TEXT, bilder: {}, ...teil,
  };
}

describe("angebotPdf", () => {
  it("erzeugt ein gültiges PDF mit einer Seite für ein kurzes Angebot", async () => {
    const bytes = await angebotPdf(daten([pos("Wandflächen streichen", 313.63, "m²", 11.8), pos("Sockelleisten", 243.5, "Lfm", 1.2)]));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("bricht lange Angebote auf mehrere Seiten um", async () => {
    const viele = Array.from({ length: 60 }, (_, i) => pos(`Position ${i + 1}`, i + 1, "m²", 10.5, "Langtext mit mehreren Wörtern, der über mehrere Zeilen laufen kann und trotzdem sauber umbricht."));
    const doc = await PDFDocument.load(await angebotPdf(daten(viele)));
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  it("verträgt Sonderzeichen, Emojis, sehr lange Wörter und leere Texte", async () => {
    const bausteine = [
      andere("titel", { kurztext: "Wohnzimmer 🎨 „Test“ – €" }),
      pos("Wort".repeat(80), 1, "psch", 100, "Tab\there und Space ✓ ß ä ö ü"),
      andere("text", { langtext: "Hinweis ohne Preis\n\nmit Leerzeile" }),
      andere("zwischensumme"),
      andere("bild", { kurztext: "ohne Bild-Daten" }),
    ];
    const bytes = await angebotPdf(daten(bausteine, { empfaenger: "", einleitung: "", schlusstext: "", leistungsort: "" }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("alle Steuervarianten: 19 %, 7 %, 0 %, Reverse-Charge, mit Rabatt, nicht mehr Entwurf", async () => {
    const posten = [pos("A", 1, "Stk", 100)];
    for (const rechnung of [
      { rabattProzent: 0, steuersatz: 19, reverseCharge: false },
      { rabattProzent: 5, steuersatz: 7, reverseCharge: false },
      { rabattProzent: 0, steuersatz: 0, reverseCharge: false },
      { rabattProzent: 2.5, steuersatz: 0, reverseCharge: true },
    ]) {
      const bytes = await angebotPdf(daten(posten, { status: "versendet" }, rechnung));
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    }
  });

  it("Logo (PNG) wird eingebettet, ein kaputtes Logo bricht nicht ab", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const mitLogo = await angebotPdf(daten([pos("A", 1, "Stk", 1)], { logo: png }));
    const ohneLogo = await angebotPdf(daten([pos("A", 1, "Stk", 1)]));
    expect(mitLogo.length).toBeGreaterThan(ohneLogo.length);
    const kaputt = await angebotPdf(daten([pos("A", 1, "Stk", 1)], { logo: new Uint8Array([1, 2, 3]) }));
    expect((await PDFDocument.load(kaputt)).getPageCount()).toBe(1);
  });

  it("Zahlungsbedingungen und „gültig bis“ erscheinen im PDF, lange Sätze brechen nicht ab", async () => {
    const posten = [pos("A", 1, "Stk", 100)];
    const ohne = await angebotPdf(daten(posten));
    const mit = await angebotPdf(daten(posten, { zahlungsbedingung: "Bei Zahlung innerhalb von 7 Tagen 2 % Skonto, zahlbar innerhalb von 30 Tagen netto", gueltigBis: "2026-11-17" }));
    expect(mit.length).toBeGreaterThan(ohne.length);
    expect((await PDFDocument.load(mit)).getPageCount()).toBe(1);
    const viele = Array.from({ length: 40 }, (_, i) => pos(`Position ${i + 1}`, 1, "m²", 10));
    const lang = await angebotPdf(daten(viele, { zahlungsbedingung: "x ".repeat(300), gueltigBis: "2026-11-17" }));
    expect((await PDFDocument.load(lang)).getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("leeres Angebot und leere Firmendaten brechen nicht ab", async () => {
    const bytes = await angebotPdf(daten([], { firma: { ...firma, name: "", ustid: "", iban: "", bank: "", bic: "", inhaber: "", steuernummer: "" } }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("erzeugt für jede Dokumentart ein gültiges PDF (auch Lieferschein ohne Preise, Brief ohne Positionen, Nachtrag)", async () => {
    const posten = [pos("Wände", 10, "m²", 10), andere("zwischensumme"), pos("Decke", 5, "m²", 8)];
    const groessen: Record<string, number> = {};
    for (const art of ["angebot", "kostenvoranschlag", "auftragsbestaetigung", "lieferschein", "bestellschein", "brief"]) {
      const bytes = await angebotPdf(daten(posten, { dokumentart: art, gueltigBis: "2026-11-17", zahlungsbedingung: "14 Tage netto" }));
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      groessen[art] = bytes.length;
    }
    // Ohne Preise, Summen und Tabelle bleibt weniger Inhalt übrig
    expect(groessen.lieferschein).toBeLessThan(groessen.angebot);
    expect(groessen.brief).toBeLessThan(groessen.lieferschein);
    const nachtrag = await angebotPdf(daten(posten, { dokumentart: "auftragsbestaetigung", nachtrag: true, status: "versendet" }));
    expect((await PDFDocument.load(nachtrag)).getPageCount()).toBe(1);
  });
});
