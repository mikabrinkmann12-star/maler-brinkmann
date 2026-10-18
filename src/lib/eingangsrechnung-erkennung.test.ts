import { describe, expect, it } from "vitest";
import { betragLesen, datumLesen, felderAusText, ibanGueltig, tageDazu, vollstaendigkeit } from "./eingangsrechnung-erkennung";

const BEISPIEL = `Farben Müller GmbH · Industrieweg 4 · 26683 Saterland
Maler Betrieb Brinkmann
Hauptstraße 1
26683 Saterland

Rechnung
Rechnungsnummer: RE-2026-0815
Rechnungsdatum: 12.03.2026
Kundennummer 4711

Pos Artikel Menge Preis
1 Dispersionsfarbe weiß 10 kg 3 25,00
Nettobetrag 100,00 €
19 % USt 19,00 €
Gesamtbetrag 119,00 €

Zahlbar innerhalb von 14 Tagen netto.
IBAN DE89 3704 0044 0532 0130 00`;

describe("betragLesen", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(betragLesen("1.234,56")).toBe(1234.56);
    expect(betragLesen("1234,56 €")).toBe(1234.56);
    expect(betragLesen("12,5")).toBe(12.5);
    expect(betragLesen("1,234.56")).toBe(1234.56);
    expect(betragLesen("12.50")).toBe(12.5);
    expect(betragLesen("1.234")).toBe(1234);
    expect(betragLesen("-45,10")).toBe(-45.1);
  });
  it("lehnt Unsinn ab", () => {
    expect(betragLesen("abc")).toBeNull();
    expect(betragLesen("")).toBeNull();
  });
});

describe("datumLesen", () => {
  it("liest übliche Schreibweisen", () => {
    expect(datumLesen("12.03.2026")).toBe("2026-03-12");
    expect(datumLesen("2.3.26")).toBe("2026-03-02");
    expect(datumLesen("2026-03-12")).toBe("2026-03-12");
  });
  it("lehnt unmögliche Tage ab", () => {
    expect(datumLesen("31.02.2026")).toBeNull();
    expect(datumLesen("12.13.2026")).toBeNull();
  });
  it("rechnet Tage dazu", () => {
    expect(tageDazu("2026-03-12", 14)).toBe("2026-03-26");
    expect(tageDazu("2026-12-25", 10)).toBe("2027-01-04");
  });
});

describe("ibanGueltig", () => {
  it("prüft die Prüfsumme", () => {
    expect(ibanGueltig("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(ibanGueltig("DE89 3704 0044 0532 0130 01")).toBe(false);
  });
});

describe("felderAusText", () => {
  it("liest eine typische Rechnung", () => {
    const f = felderAusText(BEISPIEL, [], ["Brinkmann"]);
    expect(f.lieferant).toBe("Farben Müller GmbH");
    expect(f.rechnungsnummer).toBe("RE-2026-0815");
    expect(f.rechnungsdatum).toBe("2026-03-12");
    expect(f.faelligAm).toBe("2026-03-26");
    expect(f.netto).toBe(100);
    expect(f.brutto).toBe(119);
    expect(f.iban).toBe("DE89370400440532013000");
    expect(vollstaendigkeit(f)).toBe(4);
  });

  it("nimmt einen bekannten Lieferanten, auch ohne Rechtsform", () => {
    const f = felderAusText("Lackhaus Nord\nRechnung Nr. 4711/26\nDatum: 01.04.2026\nGesamtbetrag 59,50 EUR", ["Lackhaus Nord", "Sonstige GmbH"], []);
    expect(f.lieferant).toBe("Lackhaus Nord");
    expect(f.rechnungsnummer).toBe("4711/26");
    expect(f.rechnungsdatum).toBe("2026-04-01");
    expect(f.brutto).toBe(59.5);
  });

  it("nimmt nie den eigenen Betrieb als Lieferant", () => {
    const f = felderAusText("Brinkmann Maler GmbH\nRechnungsnr. 12345\nGesamtbetrag 10,00 €", [], ["Brinkmann"]);
    expect(f.lieferant).toBe("");
  });

  it("schätzt Netto aus Brutto, wenn nur ein Steuersatz vorkommt", () => {
    const f = felderAusText("Rechnungsnummer 999\nGesamtbetrag 119,00 €\nenthaltene MwSt 19 % 19,00 €", [], []);
    expect(f.brutto).toBe(119);
    expect(f.netto).toBe(100);
  });

  it("nimmt das Datum nach der Beschriftung Fällig", () => {
    const f = felderAusText("Rechnungsdatum 01.06.2026\nFällig am 15.06.2026\nGesamtbetrag 5,00 €", [], []);
    expect(f.faelligAm).toBe("2026-06-15");
  });

  it("gibt bei Text ohne Rechnung leere Felder zurück", () => {
    const f = felderAusText("Hallo, anbei die Unterlagen.", [], []);
    expect(vollstaendigkeit(f)).toBe(0);
    expect(f.netto).toBeNull();
  });

  it("verwechselt 10 kg nicht mit einer Rechtsform", () => {
    const f = felderAusText("Weißer Lack 10 kg\nRechnungsnummer 777", [], []);
    expect(f.lieferant).toBe("");
  });
});
