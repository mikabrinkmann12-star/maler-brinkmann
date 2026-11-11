import { describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN } from "./kalkulation";
import { istStundenEinheit, lohnanteilBerechnen, lohnanteilText, lohnanteilZeigen, lohnEinzelAusQuote, lohnQuoteAusKalkulation } from "./lohnanteil";
import type { RechnungsBaustein } from "./rechnung";

const pos = (menge: number, preis: number, lohn: number | null): RechnungsBaustein => ({ typ: "position", kurztext: "A", langtext: "", menge, einheit: "m²", einzelpreis: preis, lohnEinzel: lohn });
const steuer = { rabattProzent: 0, steuersatz: 19, reverseCharge: false };

describe("Lohnanteil", () => {
  it("Anteil des Lohns aus der Kalkulation einer Leistung", () => {
    // 60 Minuten Standard-Lohngruppe = 47,50 € Lohn, 10 € Material mit 40 % = 14,00 € → 47,50 / 61,50
    const q = lohnQuoteAusKalkulation({ lohngruppeId: "standard", lohnMinuten: 60, material: 10, geraete: 0, fremdleistung: 0, sonstiges: 0 }, STANDARD_EINSTELLUNGEN);
    expect(q).toBeCloseTo(47.5 / 61.5, 6);
    expect(lohnQuoteAusKalkulation(null, STANDARD_EINSTELLUNGEN)).toBeNull();
    expect(lohnEinzelAusQuote(61.5, q)).toBe(47.5);
    expect(lohnEinzelAusQuote(null, 0.5)).toBeNull();
    expect(lohnEinzelAusQuote(10, null)).toBeNull();
  });

  it("summiert Menge × Lohn, zieht den Rabatt ab und rechnet die Steuer", () => {
    const l = lohnanteilBerechnen([pos(16.5, 51.55, 51.55), pos(1, 180, 0), { typ: "text", kurztext: "Titel", langtext: "", menge: null, einheit: "", einzelpreis: null }], steuer);
    expect(l).toEqual({ netto: 850.58, ust: 161.61, brutto: 1012.19, unvollstaendig: false });
    const mitRabatt = lohnanteilBerechnen([pos(10, 100, 50)], { ...steuer, rabattProzent: 10 });
    expect(mitRabatt.netto).toBe(450);
    expect(lohnanteilBerechnen([pos(10, 100, 50)], { ...steuer, reverseCharge: true }).ust).toBe(0);
  });

  it("merkt sich Positionen ohne Angabe", () => {
    expect(lohnanteilBerechnen([pos(1, 75, null), pos(2, 10, 10)], steuer)).toMatchObject({ netto: 20, unvollstaendig: true });
  });

  it("Satz für die Rechnung, bei der Schlussrechnung mit Abzug der Abschläge", () => {
    const l = { netto: 1000, ust: 190, brutto: 1190, unvollstaendig: false };
    expect(lohnanteilText(l)?.replace(/ /g, " ")).toBe("In diesem Rechnungsbetrag sind Lohnkosten (Arbeitskosten nach § 35a EStG) von 1.000,00 € netto zzgl. 190,00 € USt, zusammen 1.190,00 € enthalten.");
    expect(lohnanteilText(l, 400)?.replace(/ /g, " ")).toContain("bereits 400,00 € ausgewiesen, auf diese Rechnung entfallen 790,00 €");
    expect(lohnanteilText({ netto: 0, ust: 0, brutto: 0, unvollstaendig: true })).toBeNull();
  });

  it("Einstellung und Stunden-Einheit", () => {
    expect(lohnanteilZeigen({ lohnPrivat: true, lohnFirma: false }, "privat")).toBe(true);
    expect(lohnanteilZeigen({ lohnPrivat: true, lohnFirma: false }, "firma")).toBe(false);
    expect(["Std.", "Std", "Stunden", "h", " std. "].every(istStundenEinheit)).toBe(true);
    expect(["psch.", "m²", "Stk."].some(istStundenEinheit)).toBe(false);
  });
});
