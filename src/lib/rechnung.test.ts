import { describe, expect, it } from "vitest";
import type { Baustein } from "./angebot";
import { bausteineAusAngebot, rechnungBerechnen, zahlungsbedingungText, type RechnungsBaustein } from "./rechnung";

let n = 0;
const b = (typ: Baustein["typ"], teil: Partial<Baustein> = {}): Baustein => ({
  id: `b${++n}`, typ, kurztext: "", langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null, ...teil,
});

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
