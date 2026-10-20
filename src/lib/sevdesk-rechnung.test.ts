import { describe, expect, it } from "vitest";
import type { RechnungDaten, RechnungsBaustein } from "./rechnung";
import { rechnungInfoAusSevdesk, sevdeskDatum, sevdeskDatumLesen, sevdeskEinheit, sevdeskKontaktEingabe, sevdeskRechnungKoerper, statusAusSevdesk } from "./sevdesk-rechnung";

const daten: RechnungDaten = {
  betreff: "Wohnzimmer streichen",
  rechnungsdatum: "2026-10-20",
  leistungVon: "2026-10-05",
  leistungBis: "2026-10-09",
  zahlungszielTage: 14,
  skontoProzent: null,
  skontoTage: null,
  steuersatz: 19,
  reverseCharge: false,
  rabattProzent: 0,
  einleitung: "Vielen Dank für den Auftrag.",
  schlusstext: "Bitte überweisen.",
};
const pos = (kurz: string, menge: number, einheit: string, preis: number, lang = ""): RechnungsBaustein => ({ typ: "position", kurztext: kurz, langtext: lang, menge, einheit, einzelpreis: preis });
const einheiten = new Map([["stk", 1], ["std", 9], ["m2", 4], ["psch", 7]]);
const ctx = { kontaktId: "900", benutzerId: "77", einheiten };

describe("Datum", () => {
  it("schreibt TT.MM.JJJJ und liest beide Formen", () => {
    expect(sevdeskDatum("2026-10-20")).toBe("20.10.2026");
    expect(sevdeskDatumLesen("20.10.2026")).toBe("2026-10-20");
    expect(sevdeskDatumLesen("2026-10-20T00:00:00+02:00")).toBe("2026-10-20");
    expect(sevdeskDatumLesen(1_792_000_000)).toMatch(/^2026-/);
    expect(sevdeskDatumLesen(null)).toBe("");
  });
});

describe("sevdeskEinheit", () => {
  it("findet Einheiten über Namen und Synonyme, sonst Stück", () => {
    expect(sevdeskEinheit("m²", einheiten)).toEqual({ ref: { id: 4, objectName: "Unity" }, passend: true });
    expect(sevdeskEinheit("Std.", einheiten).ref.id).toBe(9);
    expect(sevdeskEinheit("qm", einheiten).ref.id).toBe(4);
    expect(sevdeskEinheit("Eimer", einheiten)).toEqual({ ref: { id: 1, objectName: "Unity" }, passend: false });
  });
});

describe("sevdeskRechnungKoerper", () => {
  it("baut Entwurf, Positionen und Steuerregel 1 bei 19 %", () => {
    const k = sevdeskRechnungKoerper(daten, [pos("Wand streichen", 40, "m²", 12.5, "zweimal streichen")], ctx);
    expect(k.invoice).toMatchObject({
      invoiceType: "RE",
      status: 100,
      currency: "EUR",
      invoiceDate: "20.10.2026",
      deliveryDate: "05.10.2026",
      contact: { id: 900, objectName: "Contact" },
      contactPerson: { id: 77, objectName: "SevUser" },
      taxRule: { id: "1", objectName: "TaxRule" },
      taxText: "Umsatzsteuer 19%",
      taxRate: 19,
      timeToPay: 14,
      showNet: true,
      header: "Wohnzimmer streichen",
    });
    expect(k.invoice).toHaveProperty("deliveryDateUntil");
    expect(k.invoicePosSave).toHaveLength(1);
    expect(k.invoicePosSave[0]).toMatchObject({ positionNumber: 0, name: "Wand streichen", text: "zweimal streichen", quantity: 40, price: 12.5, taxRate: 19, unity: { id: 4, objectName: "Unity" } });
    expect(k.takeDefaultAddress).toBe(true);
    expect(k.invoicePosDelete).toBeNull();
  });

  it("Reverse-Charge: Steuerregel 5, Steuersatz 0 und Hinweistext", () => {
    const k = sevdeskRechnungKoerper({ ...daten, steuersatz: 0, reverseCharge: true }, [pos("Arbeit", 1, "psch", 100)], ctx);
    expect(k.invoice).toMatchObject({ taxRule: { id: "5" }, taxRate: 0 });
    expect(String(k.invoice.taxText)).toContain("§ 13b");
    expect(k.invoicePosSave[0].taxRate).toBe(0);
  });

  it("Rabatt wird eine Zeile mit negativem Betrag, auf den Cent genau", () => {
    const k = sevdeskRechnungKoerper({ ...daten, rabattProzent: 5 }, [pos("A", 1, "Stk", 200)], ctx);
    expect(k.invoicePosSave).toHaveLength(2);
    expect(k.invoicePosSave[1]).toMatchObject({ name: "Rabatt 5 %", quantity: 1, price: -10, unity: { id: 7 } });
  });

  it("Textzeilen gehören zur nächsten Position, übrige ans Ende des Fußtextes", () => {
    const k = sevdeskRechnungKoerper(
      daten,
      [
        { typ: "text", kurztext: "Wohnzimmer", langtext: "", menge: null, einheit: "", einzelpreis: null },
        pos("Decke", 1, "Stk", 50),
        { typ: "text", kurztext: "", langtext: "Gilt nur nach Absprache.", menge: null, einheit: "", einzelpreis: null },
      ],
      ctx,
    );
    expect(k.invoicePosSave).toHaveLength(1);
    expect(k.invoicePosSave[0].text).toBe("Wohnzimmer");
    expect(String(k.invoice.footText)).toContain("Gilt nur nach Absprache.");
  });

  it("unbekannte Einheit steht in der Beschreibung", () => {
    const k = sevdeskRechnungKoerper(daten, [pos("Farbe", 3, "Eimer", 40)], ctx);
    expect(k.invoicePosSave[0].text).toContain("Einheit: Eimer");
    expect(k.invoicePosSave[0].unity.id).toBe(1);
  });

  it("Skonto, Zahlungsbedingung im Fußtext, Einzeltag ohne Zeitraum, Leitweg-ID macht E-Rechnung", () => {
    const k = sevdeskRechnungKoerper({ ...daten, leistungBis: daten.leistungVon, skontoProzent: 2, skontoTage: 7, leitwegId: "04011000-1234512345-06" }, [pos("A", 1, "Stk", 10)], ctx);
    expect(k.invoice).not.toHaveProperty("deliveryDateUntil");
    expect(k.invoice).toMatchObject({ discount: 2, discountTime: 7, propertyIsEInvoice: true });
    expect(String(k.invoice.footText)).toContain("Skonto");
  });

  it("maskiert HTML in den Texten", () => {
    const k = sevdeskRechnungKoerper({ ...daten, einleitung: "<b>x</b> & y" }, [pos("A", 1, "Stk", 10)], ctx);
    expect(k.invoice.headText).toBe("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });
});

describe("Antworten und Kunden", () => {
  it("rechnet Status und Beträge aus der sevdesk-Antwort um", () => {
    expect(statusAusSevdesk("100")).toBe("draft");
    expect(statusAusSevdesk(200)).toBe("open");
    expect(statusAusSevdesk("750")).toBe("open");
    expect(statusAusSevdesk("1000")).toBe("paid");
    expect(statusAusSevdesk("999")).toBe("");
    expect(rechnungInfoAusSevdesk({ invoiceNumber: "RE-5", status: "750", sumNet: "84.03", sumGross: "100.00" })).toMatchObject({ rechnungsnummer: "RE-5", status: "open", teilbezahlt: true, netto: 84.03, brutto: 100 });
    expect(rechnungInfoAusSevdesk(null)).toMatchObject({ rechnungsnummer: "", status: "", netto: null, brutto: null });
  });

  it("Kunde: Firma oder Person", () => {
    const basis = { anrede: null, ansprechpartner: "Max Muster", strasse: "A 1", plz: "26683", ort: "Saterland", email: "a@b.de" };
    expect(sevdeskKontaktEingabe({ ...basis, typ: "firma", firmenname: "Muster GmbH", vorname: null, nachname: null })).toMatchObject({ firma: "Muster GmbH", ansprechpartner: "Max Muster" });
    expect(sevdeskKontaktEingabe({ ...basis, typ: "privat", firmenname: null, vorname: "Anna", nachname: "Apfel", kundennummer: "KD-7" })).toMatchObject({ firma: "", vorname: "Anna", nachname: "Apfel", kundennummer: "KD-7" });
  });
});
