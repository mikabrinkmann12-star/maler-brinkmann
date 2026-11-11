import { describe, expect, it } from "vitest";
import { angebotBerechnen, type Baustein } from "./angebot";
import { eRechnungErzeugen, einheitenCode, laenderCode, rechnungsTypCode, type ERechnungDaten } from "./e-rechnung";
import { FIRMA_LEER, type Firma } from "./firma";

const firma: Firma = { ...FIRMA_LEER, name: "Maler Betrieb Brinkmann & Söhne", inhaber: "Ralf Brinkmann", strasse: "Zur Ziegelei 18", plz: "26683", ort: "Saterland", telefon: "04492/708108", email: "info@maler-brinkmann.de", ustid: "DE292718369", steuernummer: "56/106/09816", iban: "DE74 2806 5286 0401 6947 05", bic: "GENODEF1SAN" };

let n = 0;
const pos = (kurz: string, menge: number, einheit: string, preis: number, lang = ""): Baustein => ({ id: `p${++n}`, typ: "position", kurztext: kurz, langtext: lang, menge, einheit, einzelpreis: preis, bildPfad: null });
const titel = (kurz: string): Baustein => ({ id: `t${++n}`, typ: "titel", kurztext: kurz, langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null });

function daten(teil: Partial<ERechnungDaten> = {}, optionen = { rabattProzent: 0, steuersatz: 19, reverseCharge: false }): ERechnungDaten {
  const bausteine = [titel("Wohnzimmer"), pos("Wände streichen", 84.5, "m²", 11.8, "Zweimal <weiß>"), pos("Decken streichen", 32, "m²", 9.5)];
  return {
    art: "rechnung", nummer: "R-2026-0001", datum: "2026-10-24", leistungVon: "2026-10-12", leistungBis: "2026-10-23", faelligAm: "2026-11-07", betreff: "Innenanstrich",
    zahlungsbedingung: "Zahlbar innerhalb von 14 Tagen netto", verkaeufer: firma,
    kaeufer: { name: "Anna Muster", strasse: "Hauptstraße 12", plz: "26683", ort: "Saterland", land: "Deutschland", email: "anna@example.com", leitwegId: "" },
    berechnung: angebotBerechnen(bausteine, optionen), reverseChargeText: "Steuerschuldnerschaft des Leistungsempfängers", abzugBrutto: 0, ...teil,
  };
}

/** Prüft nur, ob Anfangs- und End-Tags zusammenpassen (Node hat keinen eingebauten XML-Parser). */
function wohlgeformt(xml: string): boolean {
  const stapel: string[] = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, schliessen, name, , selbst] = m;
    if (selbst) continue;
    if (schliessen) {
      if (stapel.pop() !== name) return false;
    } else stapel.push(name);
  }
  return stapel.length === 0;
}
const wert = (xml: string, tag: string): string | undefined => new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml)?.[1];

describe("eRechnungErzeugen", () => {
  it("baut eine wohlgeformte Rechnung mit Kopf, Positionen und Summen, die zusammenpassen", () => {
    const r = eRechnungErzeugen(daten());
    expect(wohlgeformt(r.xml)).toBe(true);
    expect(r.profil).toBe("en16931");
    expect(r.xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(wert(r.xml, "ram:TypeCode")).toBe("380");
    expect(r.xml).toContain('<udt:DateTimeString format="102">20261024</udt:DateTimeString>');
    // zwei Positionen (der Titel ist keine Zeile)
    expect((r.xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) ?? []).length).toBe(2);
    expect(r.xml).toContain('<ram:BilledQuantity unitCode="MTK">84.5</ram:BilledQuantity>');
    expect(r.xml).toContain("<ram:LineTotalAmount>997.10</ram:LineTotalAmount>");
    // Summen: netto 1301,10 + USt 247,21 = brutto 1548,31
    expect(r.xml).toContain("<ram:TaxBasisTotalAmount>1301.10</ram:TaxBasisTotalAmount>");
    expect(r.xml).toContain('<ram:TaxTotalAmount currencyID="EUR">247.21</ram:TaxTotalAmount>');
    expect(r.xml).toContain("<ram:GrandTotalAmount>1548.31</ram:GrandTotalAmount>");
    expect(r.xml).toContain("<ram:DuePayableAmount>1548.31</ram:DuePayableAmount>");
    expect(r.warnungen).toEqual([]);
  });

  it("maskiert Sonderzeichen, Firmenname und Beschreibung bleiben gültig", () => {
    const r = eRechnungErzeugen(daten());
    expect(r.xml).toContain("Maler Betrieb Brinkmann &amp; Söhne");
    expect(r.xml).toContain("Zweimal &lt;weiß&gt;");
    expect(wohlgeformt(r.xml)).toBe(true);
  });

  it("Verkäufer: Kontakt, Anschrift, E-Mail-Adresse und beide Steuernummern; IBAN ohne Leerzeichen", () => {
    const r = eRechnungErzeugen(daten());
    expect(r.xml).toContain('<ram:ID schemeID="VA">DE292718369</ram:ID>');
    expect(r.xml).toContain('<ram:ID schemeID="FC">56/106/09816</ram:ID>');
    expect(r.xml).toContain('<ram:URIID schemeID="EM">info@maler-brinkmann.de</ram:URIID>');
    expect(r.xml).toContain("<ram:IBANID>DE74280652860401694705</ram:IBANID>");
    expect(r.xml).toContain("<ram:CountryID>DE</ram:CountryID>");
  });

  it("Rabatt kommt als Nachlass auf Belegebene, Summen bleiben stimmig", () => {
    const r = eRechnungErzeugen(daten({}, { rabattProzent: 10, steuersatz: 19, reverseCharge: false }));
    expect(r.xml).toContain("<ram:AllowanceTotalAmount>130.11</ram:AllowanceTotalAmount>");
    expect(r.xml).toContain("<ram:TaxBasisTotalAmount>1170.99</ram:TaxBasisTotalAmount>");
    expect(r.xml).toContain("<ram:ActualAmount>130.11</ram:ActualAmount>");
    expect(wohlgeformt(r.xml)).toBe(true);
  });

  it("Leitweg-ID macht daraus eine XRechnung", () => {
    const r = eRechnungErzeugen(daten({ kaeufer: { name: "Gemeinde", strasse: "Rathausplatz 1", plz: "26683", ort: "Saterland", land: "DE", email: "rechnung@gemeinde.example", leitwegId: "04-0112-00-12" } }));
    expect(r.profil).toBe("xrechnung");
    expect(r.xml).toContain("xrechnung_3.0");
    expect(r.xml).toContain("<ram:BuyerReference>04-0112-00-12</ram:BuyerReference>");
  });

  it("Gutschrift und Storno haben den Typ 381 und nennen die Ursprungsrechnung, Abschlag den Typ 386", () => {
    const g = eRechnungErzeugen(daten({ art: "storno", nummer: "G-2026-0001", bezug: { nummer: "R-2026-0001", datum: "2026-10-24" } }));
    expect(wert(g.xml, "ram:TypeCode")).toBe("381");
    expect(g.xml).toContain("<ram:IssuerAssignedID>R-2026-0001</ram:IssuerAssignedID>");
    expect(rechnungsTypCode("abschlag")).toBe("386");
    expect(rechnungsTypCode("schluss")).toBe("380");
  });

  it("Schlussrechnung: bereits gezahlte Abschläge stehen als Vorauszahlung, der Zahlbetrag sinkt", () => {
    const r = eRechnungErzeugen(daten({ art: "schluss", abzugBrutto: 464.49 }));
    expect(r.xml).toContain("<ram:TotalPrepaidAmount>464.49</ram:TotalPrepaidAmount>");
    expect(r.xml).toContain("<ram:GrandTotalAmount>1548.31</ram:GrandTotalAmount>");
    expect(r.xml).toContain("<ram:DuePayableAmount>1083.82</ram:DuePayableAmount>");
  });

  it("Reverse-Charge: Kategorie AE ohne Steuer, mit Befreiungsgrund in der richtigen Reihenfolge, plus Warnung", () => {
    const r = eRechnungErzeugen(daten({}, { rabattProzent: 0, steuersatz: 0, reverseCharge: true }));
    expect(r.xml).toContain("<ram:CategoryCode>AE</ram:CategoryCode><ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>");
    expect(r.xml.indexOf("<ram:ExemptionReason>")).toBeLessThan(r.xml.indexOf("<ram:BasisAmount>1301.10"));
    expect(r.xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>');
    expect(r.warnungen.join(" ")).toContain("USt-IdNr.");
    expect(r.xml).not.toContain("DE288936236");
  });

  it("Reverse-Charge mit USt-IdNr. des Kunden: steht beim Käufer, keine Warnung dazu", () => {
    const r = eRechnungErzeugen(
      daten({ kaeufer: { name: "Wallschlag GmbH", strasse: "Dreschenweg 1", plz: "26683", ort: "Saterland", land: "Deutschland", email: "a@example.com", leitwegId: "", ustId: "DE 288936236" } }, { rabattProzent: 0, steuersatz: 0, reverseCharge: true }),
    );
    const kaeufer = r.xml.slice(r.xml.indexOf("<ram:BuyerTradeParty>"), r.xml.indexOf("</ram:BuyerTradeParty>"));
    expect(kaeufer).toContain('<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE288936236</ram:ID></ram:SpecifiedTaxRegistration>');
    expect(r.warnungen.join(" ")).not.toContain("Reverse-Charge");
  });

  it("warnt bei fehlenden Angaben, erzeugt aber trotzdem", () => {
    const r = eRechnungErzeugen(daten({ verkaeufer: { ...firma, email: "", telefon: "", iban: "" }, kaeufer: { name: "X", strasse: "", plz: "", ort: "", land: "Atlantis", email: "", leitwegId: "" } }));
    expect(r.warnungen.length).toBeGreaterThanOrEqual(5);
    expect(wohlgeformt(r.xml)).toBe(true);
  });
});

describe("Hilfen", () => {
  it("Einheiten und Länder", () => {
    expect(einheitenCode("m²")).toBe("MTK");
    expect(einheitenCode("Std.")).toBe("HUR");
    expect(einheitenCode("psch")).toBe("C62");
    expect(einheitenCode("Zauber")).toBe("C62");
    expect(laenderCode("Deutschland")).toBe("DE");
    expect(laenderCode("")).toBe("DE");
    expect(laenderCode("at")).toBe("AT");
    expect(laenderCode("Atlantis")).toBeNull();
  });
});
