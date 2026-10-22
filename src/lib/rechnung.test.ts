import { describe, expect, it } from "vitest";
import type { Baustein } from "./angebot";
import {
  bausteineAusAngebot,
  lexwareDatum,
  lexwareKontaktPayload,
  lexwareNameUndBeschreibung,
  lexwareNummern,
  lexwareRechnungPayload,
  rechnungBerechnen,
  rechnungInfoAusLexware,
  zahlungsbedingungText,
  type RechnungDaten,
  type RechnungsBaustein,
} from "./rechnung";

let n = 0;
const b = (typ: Baustein["typ"], teil: Partial<Baustein> = {}): Baustein => ({
  id: `b${++n}`, typ, kurztext: "", langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null, ...teil,
});

const basis: RechnungDaten = {
  betreff: "Haus 2", rechnungsdatum: "2026-10-18", leistungVon: "2026-09-01", leistungBis: "2026-10-15", zahlungszielTage: 14,
  skontoProzent: null, skontoTage: null, steuersatz: 19, reverseCharge: false, rabattProzent: 0, einleitung: "", schlusstext: "",
};
const pos = (kurz: string, menge: number, preis: number, lang = ""): RechnungsBaustein => ({ typ: "position", kurztext: kurz, langtext: lang, menge, einheit: "m²", einzelpreis: preis });

describe("bausteineAusAngebot", () => {
  it("übernimmt Positionen, macht Titel und Text zu Textzeilen, lässt Zwischensumme und Bild weg", () => {
    const r = bausteineAusAngebot([
      b("titel", { kurztext: "Wohnzimmer" }),
      b("position", { kurztext: "Wände", menge: 10, einheit: "m²", einzelpreis: 5 }),
      b("text", { langtext: "Hinweis" }),
      b("zwischensumme"),
      b("bild", { bildPfad: "a/b.jpg" }),
    ]);
    expect(r.map((x) => [x.typ, x.kurztext || x.langtext])).toEqual([["text", "Wohnzimmer"], ["position", "Wände"], ["text", "Hinweis"]]);
  });
});

describe("rechnungBerechnen", () => {
  it("rechnet wie beim Angebot, Textzeilen zählen nicht", () => {
    const r = rechnungBerechnen([pos("A", 2, 10.5), { typ: "text", kurztext: "Titel", langtext: "", menge: null, einheit: "", einzelpreis: null }], {
      rabattProzent: 10, steuersatz: 19, reverseCharge: false,
    });
    expect([r.netto, r.rabatt, r.nettoNachRabatt, r.ust, r.brutto]).toEqual([21, 2.1, 18.9, 3.59, 22.49]);
  });
});

describe("zahlungsbedingungText", () => {
  it("mit und ohne Skonto", () => {
    expect(zahlungsbedingungText(14, null, null)).toBe("Zahlbar innerhalb von 14 Tagen netto");
    expect(zahlungsbedingungText(0, null, null)).toBe("Zahlbar sofort netto");
    expect(zahlungsbedingungText(30, 2, 7)).toBe("Bei Zahlung innerhalb von 7 Tagen 2 % Skonto, zahlbar innerhalb von 30 Tagen netto");
    expect(zahlungsbedingungText(30, 2.5, 7)).toContain("2,5 % Skonto");
  });
});

describe("lexwareDatum", () => {
  it("Mitternacht in deutscher Zeit mit Sommer-/Winterzeit", () => {
    expect(lexwareDatum("2026-10-18")).toBe("2026-10-18T00:00:00.000+02:00"); // Sommerzeit bis 25.10.2026
    expect(lexwareDatum("2026-12-01")).toBe("2026-12-01T00:00:00.000+01:00");
    expect(lexwareDatum("2026-03-29")).toBe("2026-03-29T00:00:00.000+01:00"); // Umstellung erst um 2 Uhr nachts
    expect(lexwareDatum("2026-07-01")).toBe("2026-07-01T00:00:00.000+02:00");
  });
});

describe("lexwareNameUndBeschreibung", () => {
  it("Kurztext ist der Name, der Langtext die Beschreibung; ohne Kurztext dient die erste Zeile des Langtexts als Name", () => {
    expect(lexwareNameUndBeschreibung({ kurztext: "Wände", langtext: "Zweimal streichen" })).toEqual({ name: "Wände", description: "Zweimal streichen" });
    expect(lexwareNameUndBeschreibung({ kurztext: "", langtext: "Erste Zeile\nZweite Zeile" })).toEqual({ name: "Erste Zeile", description: "Zweite Zeile" });
    expect(lexwareNameUndBeschreibung({ kurztext: "x".repeat(300), langtext: "" }).name.length).toBe(255);
  });
});

describe("lexwareRechnungPayload", () => {
  it("Standardrechnung: Positionen netto, 19 %, Zahlungsziel, Leistungszeitraum, Texte", () => {
    const p = lexwareRechnungPayload(
      { ...basis, einleitung: "Hallo", schlusstext: "Danke" },
      [pos("Wände streichen", 313.63, 11.8, "Zweimal"), { typ: "text", kurztext: "Wohnzimmer", langtext: "", menge: null, einheit: "", einzelpreis: null }],
      "kontakt-1",
    );
    expect(p.address).toEqual({ contactId: "kontakt-1" });
    expect(p.taxConditions).toEqual({ taxType: "net" });
    expect(p.lineItems[0]).toEqual({
      type: "custom", name: "1. Wände streichen", description: "Zweimal", quantity: 313.63, unitName: "m²",
      unitPrice: { currency: "EUR", netAmount: 11.8, taxRatePercentage: 19 },
    });
    expect(p.lineItems[1]).toEqual({ type: "text", name: "1. Wohnzimmer" });
    expect(p.paymentConditions).toEqual({ paymentTermLabel: "Zahlbar innerhalb von 14 Tagen netto", paymentTermDuration: 14 });
    expect(p.shippingConditions).toEqual({
      shippingType: "serviceperiod", shippingDate: "2026-09-01T00:00:00.000+02:00", shippingEndDate: "2026-10-15T00:00:00.000+02:00",
    });
    expect(p.voucherDate).toBe("2026-10-18T00:00:00.000+02:00");
    // „Rechnung“ steht groß als Überschrift, der Betreff kommt in den Anfangstext (wie in Plancraft)
    expect([p.title, p.introduction, p.remark]).toEqual(["Rechnung", "Betreff: Haus 2\n\nHallo", "Danke"]);
  });

  it("Reverse-Charge: constructionService13b und Steuersatz 0 in allen Zeilen", () => {
    const p = lexwareRechnungPayload({ ...basis, reverseCharge: true, steuersatz: 0 }, [pos("A", 1, 100)], "k");
    expect(p.taxConditions.taxType).toBe("constructionService13b");
    expect(p.lineItems[0]).toMatchObject({ unitPrice: { taxRatePercentage: 0 } });
  });

  it("Rabatt wird als negative Zeile mit genau dem Cent-Betrag der App übergeben", () => {
    const p = lexwareRechnungPayload({ ...basis, rabattProzent: 10 }, [pos("A", 10, 100), pos("B", 1, 33.33)], "k");
    const letzte = p.lineItems[p.lineItems.length - 1];
    expect(letzte).toEqual({ type: "custom", name: "Rabatt 10 %", quantity: 1, unitName: "psch", unitPrice: { currency: "EUR", netAmount: -103.33, taxRatePercentage: 19 } });
  });

  it("Skonto und ein einzelner Leistungstag", () => {
    const p = lexwareRechnungPayload({ ...basis, skontoProzent: 2, skontoTage: 7, leistungVon: "2026-10-01", leistungBis: "2026-10-01" }, [pos("A", 1, 1)], "k");
    expect(p.paymentConditions.paymentDiscountConditions).toEqual({ discountPercentage: 2, discountRange: 7 });
    expect(p.shippingConditions).toEqual({ shippingType: "service", shippingDate: "2026-10-01T00:00:00.000+02:00" });
  });

  it("ohne Anfangs- und Schlusstext bleibt nur der Betreff im Anfangstext", () => {
    const p = lexwareRechnungPayload(basis, [pos("A", 1, 1)], "k");
    expect(p.introduction).toBe("Betreff: Haus 2");
    expect(lexwareRechnungPayload({ ...basis, betreff: " " }, [pos("A", 1, 1)], "k").introduction).toBeUndefined();
    expect("remark" in p).toBe(false);
  });
});

describe("lexwareNummern", () => {
  const titel = (t: string) => ({ typ: "text" as const, kurztext: t, langtext: "", menge: null, einheit: "", einzelpreis: null });
  const text = { typ: "text" as const, kurztext: "", langtext: "Hinweis", menge: null, einheit: "", einzelpreis: null };

  it("Titel bekommt 1., Positionen darunter 1.1 und 1.2, der nächste Titel 2.", () => {
    const n = lexwareNummern([titel("Baustelleneinrichtung"), pos("A", 1, 1), pos("B", 1, 1), titel("Sockel"), pos("C", 1, 1)]);
    expect(n).toEqual(["1.", "1.1", "1.2", "2.", "2.1"]);
  });

  it("ohne Titel zählen die Positionen 1., 2., 3.; freie Texte bleiben ohne Nummer", () => {
    expect(lexwareNummern([pos("A", 1, 1), text, pos("B", 1, 1)])).toEqual(["1.", "", "2."]);
  });

  it("Nummer steht vorn im Namen der Zeile", () => {
    const p = lexwareRechnungPayload(basis, [titel("Bad"), pos("Fliesen", 2, 10)], "k");
    expect(p.lineItems.map((z) => z.name)).toEqual(["1. Bad", "1.1 Fliesen"]);
  });
});

describe("lexwareKontaktPayload", () => {
  const leer = { anrede: null, firmenname: null, ansprechpartner: null, vorname: null, nachname: null, strasse: null, plz: null, ort: null, email: null };
  it("Firma mit Ansprechpartner, Adresse und E-Mail", () => {
    expect(lexwareKontaktPayload({ ...leer, typ: "firma", firmenname: "Rolfes GmbH", ansprechpartner: "Max Mustermann", strasse: "Postdamm 19", plz: "49624", ort: "Löningen", email: "a@b.de" })).toEqual({
      version: 0,
      roles: { customer: {} },
      addresses: { billing: [{ street: "Postdamm 19", zip: "49624", city: "Löningen", countryCode: "DE" }] },
      emailAddresses: { business: ["a@b.de"] },
      company: { name: "Rolfes GmbH", contactPersons: [{ firstName: "Max", lastName: "Mustermann", primary: true }] },
    });
  });
  it("Privatperson mit Anrede", () => {
    expect(lexwareKontaktPayload({ ...leer, typ: "privat", anrede: "Herr", vorname: "Hans", nachname: "Meier" })).toEqual({
      version: 0, roles: { customer: {} }, person: { salutation: "Herr", firstName: "Hans", lastName: "Meier" },
    });
  });
  it("ohne Namen bricht es nicht ab", () => {
    expect(lexwareKontaktPayload({ ...leer, typ: "privat" })).toMatchObject({ person: { lastName: "Unbekannt" } });
  });
});

describe("rechnungInfoAusLexware", () => {
  it("liest Nummer, Status und Summen; Fehlendes bleibt leer", () => {
    expect(rechnungInfoAusLexware({ voucherNumber: "RE1019", voucherStatus: "open", totalPrice: { totalNetAmount: 100, totalGrossAmount: 119 } })).toEqual({
      rechnungsnummer: "RE1019", status: "open", netto: 100, brutto: 119,
    });
    expect(rechnungInfoAusLexware(null)).toEqual({ rechnungsnummer: "", status: "", netto: null, brutto: null });
  });
});

describe("E-Rechnung: Leitweg-ID", () => {
  it("setzt bei Behörden xRechnung.buyerReference in Rechnung und Kunde, sonst nicht", () => {
    const mit = lexwareRechnungPayload({ ...basis, leitwegId: " 04011000-1234512345-35 " }, [pos("A", 1, 1)], "k");
    expect(mit.xRechnung).toEqual({ buyerReference: "04011000-1234512345-35" });
    expect("xRechnung" in lexwareRechnungPayload(basis, [pos("A", 1, 1)], "k")).toBe(false);
    expect("xRechnung" in lexwareRechnungPayload({ ...basis, leitwegId: "  " }, [pos("A", 1, 1)], "k")).toBe(false);

    const leer = { typ: "firma", anrede: null, firmenname: "Gemeinde Saterland", ansprechpartner: null, vorname: null, nachname: null, strasse: null, plz: null, ort: null, email: null };
    expect(lexwareKontaktPayload({ ...leer, leitweg_id: "04011000-1234512345-35" })).toMatchObject({ xRechnung: { buyerReference: "04011000-1234512345-35" } });
    expect("xRechnung" in lexwareKontaktPayload(leer)).toBe(false);
  });
});
