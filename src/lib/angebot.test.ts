import { describe, expect, it } from "vitest";
import {
  angebotBerechnen,
  einzelpreisLesen,
  mengeLesen,
  positionGesamt,
  zahlFuerFeld,
  zahlLesen,
  type Baustein,
} from "./angebot";

let zaehler = 0;
function b(typ: Baustein["typ"], teil: Partial<Baustein> = {}): Baustein {
  zaehler += 1;
  return { id: `b${zaehler}`, typ, kurztext: "", langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null, ...teil };
}
const pos = (menge: number, preis: number) => b("position", { kurztext: "x", menge, einheit: "m²", einzelpreis: preis });

describe("positionGesamt", () => {
  it("rechnet Menge × Preis auf Cent genau (Zahlen aus dem Plancraft-Angebot)", () => {
    expect(positionGesamt(313.63, 11.8)).toBe(3700.83);
    expect(positionGesamt(498.59, 10.95)).toBe(5459.56);
    expect(positionGesamt(71.61, 19.25)).toBe(1378.49);
    expect(positionGesamt(243.5, 1.2)).toBe(292.2);
    expect(positionGesamt(147.58, 31.25)).toBe(4611.88);
    expect(positionGesamt(186.81, 6.85)).toBe(1279.65);
    expect(positionGesamt(13, 38.5)).toBe(500.5);
    expect(positionGesamt(57.8, 66.21)).toBe(3826.94);
  });

  it("rundet 0,5 Cent auf und rechnet ohne Fließkomma-Fehler", () => {
    expect(positionGesamt(0.1, 0.2)).toBe(0.02);
    expect(positionGesamt(1.005, 1)).toBe(1.01);
    expect(positionGesamt(7.5, 9.55)).toBe(71.63);
  });

  it("negative Mengen und Preise (Abzüge) rechnen mit", () => {
    expect(positionGesamt(-2, 10)).toBe(-20);
    expect(positionGesamt(2, -10)).toBe(-20);
    expect(positionGesamt(-1.005, 1)).toBe(-1.01);
  });
});

describe("angebotBerechnen", () => {
  it("Beispiel aus Plancraft: Summe der Positionen ohne USt. (Reverse-Charge)", () => {
    const posten = [
      pos(313.63, 11.8), pos(498.59, 10.95), pos(71.61, 19.25), pos(243.5, 1.2), pos(147.58, 31.25),
      pos(186.81, 6.85), pos(13, 38.5), pos(57.8, 66.21),
    ];
    const r = angebotBerechnen(posten, { rabattProzent: 0, steuersatz: 0, reverseCharge: true });
    expect(r.zeilen.map((z) => z.gesamt)).toEqual([3700.83, 5459.56, 1378.49, 292.2, 4611.88, 1279.65, 500.5, 3826.94]);
    expect(r.zeilen.reduce((s, z) => s + (z.gesamt ?? 0), 0)).toBeCloseTo(21050.05, 2);
    expect(r.ust).toBe(0);
    expect(r.brutto).toBe(r.netto);
    expect(r.reverseCharge).toBe(true);
  });

  it("Rabatt auf die Netto-Summe, dann USt. 19 % und Brutto", () => {
    const r = angebotBerechnen([pos(10, 100), pos(1, 33.33)], { rabattProzent: 10, steuersatz: 19, reverseCharge: false });
    expect(r.netto).toBe(1033.33);
    expect(r.rabatt).toBe(103.33);
    expect(r.nettoNachRabatt).toBe(930);
    expect(r.ust).toBe(176.7);
    expect(r.brutto).toBe(1106.7);
  });

  it("7 % und 0 % ohne Reverse-Charge", () => {
    expect(angebotBerechnen([pos(1, 100)], { rabattProzent: 0, steuersatz: 7, reverseCharge: false }).brutto).toBe(107);
    const null_ = angebotBerechnen([pos(1, 100)], { rabattProzent: 0, steuersatz: 0, reverseCharge: false });
    expect(null_.ust).toBe(0);
    expect(null_.reverseCharge).toBe(false);
  });

  it("Reverse-Charge überstimmt den Steuersatz", () => {
    const r = angebotBerechnen([pos(1, 100)], { rabattProzent: 0, steuersatz: 19, reverseCharge: true });
    expect(r.steuersatz).toBe(0);
    expect(r.brutto).toBe(100);
  });

  it("leeres Angebot ist 0", () => {
    const r = angebotBerechnen([], { rabattProzent: 5, steuersatz: 19, reverseCharge: false });
    expect([r.netto, r.rabatt, r.ust, r.brutto]).toEqual([0, 0, 0, 0]);
  });

  it("nummeriert ohne Titel 1., 2., 3. und überspringt Text, Bild und Zwischensumme", () => {
    const r = angebotBerechnen([pos(1, 1), b("text", { langtext: "t" }), pos(1, 1), b("zwischensumme"), b("bild", { bildPfad: "a/b.jpg" }), pos(1, 1)], {
      rabattProzent: 0, steuersatz: 19, reverseCharge: false,
    });
    expect(r.zeilen.map((z) => z.nummer)).toEqual(["1.", "", "2.", "", "", "3."]);
  });

  it("nummeriert mit Titeln 1., 1.1, 1.2, 2., 2.1", () => {
    const r = angebotBerechnen([b("titel", { kurztext: "A" }), pos(1, 1), pos(1, 1), b("titel", { kurztext: "B" }), pos(1, 1)], {
      rabattProzent: 0, steuersatz: 19, reverseCharge: false,
    });
    expect(r.zeilen.map((z) => z.nummer)).toEqual(["1.", "1.1", "1.2", "2.", "2.1"]);
  });

  it("Positionen vor dem ersten Titel bilden eine eigene Gruppe", () => {
    const r = angebotBerechnen([pos(1, 1), b("titel", { kurztext: "A" }), pos(1, 1)], { rabattProzent: 0, steuersatz: 19, reverseCharge: false });
    expect(r.zeilen.map((z) => z.nummer)).toEqual(["1.1", "2.", "2.1"]);
  });

  it("Zwischensumme zählt seit der letzten Zwischensumme", () => {
    const r = angebotBerechnen([pos(1, 10), pos(1, 5), b("zwischensumme"), pos(1, 1), b("zwischensumme"), b("zwischensumme")], {
      rabattProzent: 0, steuersatz: 19, reverseCharge: false,
    });
    expect(r.zeilen.map((z) => z.zwischensumme)).toEqual([null, null, 15, null, 1, 0]);
    expect(r.netto).toBe(16);
  });
});

describe("Eingaben lesen", () => {
  it("Menge: deutsches Komma, bis 3 Nachkommastellen, negativ möglich", () => {
    expect(mengeLesen("313,63")).toBe(313.63);
    expect(mengeLesen("1.234,5")).toBe(1234.5);
    expect(mengeLesen("-2")).toBe(-2);
    expect(mengeLesen("0,125")).toBe(0.125);
    expect(mengeLesen("0,1234")).toBeNull();
    expect(mengeLesen("abc")).toBeNull();
    expect(mengeLesen("")).toBeNull();
  });

  it("Einzelpreis: bis 2 Nachkommastellen, Euro-Zeichen erlaubt", () => {
    expect(einzelpreisLesen("11,80 €")).toBe(11.8);
    expect(einzelpreisLesen("1.234")).toBe(1234);
    expect(einzelpreisLesen("12.5")).toBe(12.5);
    expect(einzelpreisLesen("12,345")).toBeNull();
    expect(zahlLesen("1,2,3", 2)).toBeNull();
  });

  it("zahlFuerFeld: Komma, keine überflüssigen Nullen", () => {
    expect(zahlFuerFeld(313.63)).toBe("313,63");
    expect(zahlFuerFeld(5)).toBe("5");
    expect(zahlFuerFeld(5, 2)).toBe("5,00");
    expect(zahlFuerFeld(11.8, 2)).toBe("11,80");
    expect(zahlFuerFeld(1234.5)).toBe("1234,5");
  });
});
