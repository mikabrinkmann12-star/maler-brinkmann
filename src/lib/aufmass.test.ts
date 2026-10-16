import { describe, expect, it } from "vitest";
import { abzugBewerten, aufmassBerechnen, aufmassSummen, runden, zahlLesen } from "./aufmass";

describe("aufmassBerechnen (m²)", () => {
  it("rechnet Länge × Höhe × Anzahl", () => {
    expect(aufmassBerechnen({ einheit: "m2", laenge: 4.2, hoehe: 2.6, anzahl: 2, abzuege: [] })).toMatchObject({
      brutto: 21.84,
      abzug: 0,
      menge: 21.84,
    });
  });

  it("übermisst Öffnungen bis 2,5 m², zieht größere ab (VOB)", () => {
    const r = aufmassBerechnen({
      einheit: "m2",
      laenge: 5,
      hoehe: 2.6,
      anzahl: 1,
      abzuege: [
        { bezeichnung: "Fenster", breite: 1.2, hoehe: 1.4, anzahl: 2 }, // 1,68 m² → übermessen
        { bezeichnung: "Terrassentür", breite: 2, hoehe: 2.2, anzahl: 1 }, // 4,4 m² → abziehen
      ],
    });
    expect(r.brutto).toBe(13);
    expect(r.abzuege.map((a) => a.uebermessen)).toEqual([true, false]);
    expect(r.abzug).toBe(4.4);
    expect(r.menge).toBe(8.6);
  });

  it("genau 2,5 m² wird noch übermessen, knapp darüber abgezogen", () => {
    expect(abzugBewerten({ bezeichnung: "Tür", breite: 1, hoehe: 2.5, anzahl: 1 }).uebermessen).toBe(true);
    const gross = abzugBewerten({ bezeichnung: "Tür", breite: 1.01, hoehe: 2.5, anzahl: 3 });
    expect(gross.uebermessen).toBe(false);
    expect(gross.einzelflaeche).toBe(2.525);
    expect(gross.abgezogen).toBe(7.575);
  });

  it("Abzüge gelten für die ganze Zeile, nicht je Anzahl", () => {
    const r = aufmassBerechnen({
      einheit: "m2", laenge: 4, hoehe: 2.5, anzahl: 2,
      abzuege: [{ bezeichnung: "Tor", breite: 2, hoehe: 2, anzahl: 1 }],
    });
    expect(r.menge).toBe(16); // 20 − 4
  });

  it("die Menge wird nie negativ", () => {
    const r = aufmassBerechnen({
      einheit: "m2", laenge: 1, hoehe: 2, anzahl: 1,
      abzuege: [{ bezeichnung: "Tor", breite: 3, hoehe: 3, anzahl: 1 }],
    });
    expect(r.menge).toBe(0);
  });
});

describe("aufmassBerechnen (m und Stück)", () => {
  it("laufende Meter: Länge × Anzahl, Abzüge zählen nicht", () => {
    expect(aufmassBerechnen({ einheit: "m", laenge: 12.5, hoehe: null, anzahl: 2, abzuege: [{ bezeichnung: "x", breite: 3, hoehe: 3, anzahl: 1 }] }).menge).toBe(25);
  });

  it("Stück: nur die Anzahl", () => {
    expect(aufmassBerechnen({ einheit: "stk", laenge: 5, hoehe: 5, anzahl: 4, abzuege: [] }).menge).toBe(4);
  });
});

describe("aufmassSummen", () => {
  it("fasst gleiche Positionen je Einheit zusammen (Groß/Klein egal)", () => {
    expect(
      aufmassSummen([
        { position: "Wände streichen", einheit: "m2", menge: 21.84 },
        { position: "wände streichen ", einheit: "m2", menge: 8.6 },
        { position: "Sockelleiste", einheit: "m", menge: 25 },
        { position: "Wände streichen", einheit: "m", menge: 3 },
      ]),
    ).toEqual([
      { position: "Sockelleiste", einheit: "m", menge: 25 },
      { position: "Wände streichen", einheit: "m2", menge: 30.44 },
      { position: "Wände streichen", einheit: "m", menge: 3 },
    ]);
  });
});

describe("runden und zahlLesen", () => {
  it("rundet kaufmännisch ohne Gleitkomma-Fehler", () => {
    expect(runden(1.0005, 3)).toBe(1.001);
    expect(runden(2.675, 2)).toBe(2.68);
    expect(runden(0.1 + 0.2)).toBe(0.3);
  });

  it("liest deutsche Zahlen", () => {
    expect(zahlLesen("4,20")).toBe(4.2);
    expect(zahlLesen("4.2")).toBe(4.2);
    expect(zahlLesen(" 12 ")).toBe(12);
    expect(zahlLesen("4,2,1")).toBeNull();
    expect(zahlLesen("")).toBeNull();
    expect(zahlLesen("-3")).toBeNull();
  });
});
