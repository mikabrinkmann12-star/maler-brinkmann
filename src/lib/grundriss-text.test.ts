import { describe, expect, it } from "vitest";
import { geschossAus, raeumeAusKiAntwort, raeumeAusText, zahlLesen } from "@/lib/grundriss-text";

const kurz = (seiten: string[]) => raeumeAusText(seiten).map((r) => [r.geschoss, r.name, r.boden]);

describe("zahlLesen", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(zahlLesen("25,30")).toBe(25.3);
    expect(zahlLesen("1.234,56")).toBe(1234.56);
    expect(zahlLesen("12.4")).toBe(12.4);
    expect(zahlLesen("1.250")).toBe(1250);
  });
});

describe("geschossAus", () => {
  it("normalisiert Überschriften", () => {
    expect(geschossAus("Erdgeschoss")).toBe("EG");
    expect(geschossAus("Grundriss Erdgeschoss M 1:100")).toBe("EG");
    expect(geschossAus("EG")).toBe("EG");
    expect(geschossAus("Obergeschoss")).toBe("OG");
    expect(geschossAus("1. OG")).toBe("1. OG");
    expect(geschossAus("2. Obergeschoss")).toBe("2. OG");
    expect(geschossAus("Dachgeschoß")).toBe("DG");
    expect(geschossAus("Kellergeschoss")).toBe("KG");
    expect(geschossAus("Wohnen")).toBeNull();
    expect(geschossAus("Egge")).toBeNull();
  });
});

describe("raeumeAusText", () => {
  it("liest zwei Geschosse mit Raumstempeln", () => {
    const text = [
      "Bauvorhaben Neubau EFH\nGrundriss Erdgeschoss\nWohnen 25,30 m²\nKüche F: 12,4 m²\nGäste-WC 2,10 m²\nFlur 8,75 m²",
      "Obergeschoss\nSchlafen 14,20 m²\nKind 1 11,05 m²\nBad 6,12 m²",
    ];
    expect(kurz(text)).toEqual([
      ["EG", "Wohnen", 25.3],
      ["EG", "Küche", 12.4],
      ["EG", "Gäste-WC", 2.1],
      ["EG", "Flur", 8.75],
      ["OG", "Schlafen", 14.2],
      ["OG", "Kind 1", 11.05],
      ["OG", "Bad", 6.12],
    ]);
  });

  it("setzt die Felder für einen ungeprüften PDF-Raum", () => {
    const [r] = raeumeAusText(["Wohnen 25,30 m²"]);
    expect(r).toEqual({
      geschoss: "",
      name: "Wohnen",
      boden: 25.3,
      umfang: null,
      hoehe: null,
      decke: null,
      art: "normal",
      belag: true,
      sockel: true,
      geprueft: false,
      quelle: "pdf",
    });
  });

  it("findet die Fläche in der Zeile unter dem Namen, auch mit Raumnummer und Beschriftung", () => {
    const text = ["1. OG\nBad\n6,12 m²\nU: 10,20 m\nSchlafen\n1.03\nNGF: 15,80 m²\nAbstellraum\nF = 3,4 m2"];
    expect(kurz(text)).toEqual([
      ["1. OG", "Bad", 6.12],
      ["1. OG", "Schlafen", 15.8],
      ["1. OG", "Abstellraum", 3.4],
    ]);
  });

  it("versteht m2 und qm und mehrere Räume in einer Zeile", () => {
    expect(kurz(["DG\nStudio 22,5 qm  Bad 5,2 m2 U: 9,40 m Flur 4,10 m²"])).toEqual([
      ["DG", "Studio", 22.5],
      ["DG", "Bad", 5.2],
      ["DG", "Flur", 4.1],
    ]);
  });

  it("ignoriert Summen, Grundstück, zu große und zu kleine Werte und Maßketten ohne Einheit", () => {
    const text = [
      "Erdgeschoss\nWohnen 25,30 m²\nWohnfläche gesamt 85,40 m²\nSumme 85,40 m²\nNutzfläche 30,00 m²\nBGF 120,50 m²\nGrundstück 1.234,56 m²\nHalle 1.234,56 m²\nSchacht 0,40 m²\n3,625 2,50 1,135\nGesamt:\n85,40 m²",
    ];
    expect(kurz(text)).toEqual([["EG", "Wohnen", 25.3]]);
  });

  it("nimmt doppelte Räume nur einmal", () => {
    const text = ["EG\nBad 6,12 m²\nBad 6,12 m²\nBad 6,12 m²\nKind 11,0 m²", "EG\nBad 6,12 m²"];
    expect(kurz(text)).toEqual([
      ["EG", "Bad", 6.12],
      ["EG", "Kind", 11],
    ]);
  });

  it("lässt das Geschoss ohne Überschrift leer und setzt es je Seite neu", () => {
    expect(kurz(["Erdgeschoss\nWohnen 25 m²", "Garage 18,00 m²"])).toEqual([
      ["EG", "Wohnen", 25],
      ["", "Garage", 18],
    ]);
  });

  it("unterscheidet „Keller“ als Raum und als Überschrift", () => {
    expect(kurz(["Kellergeschoss\nKeller\n12,30 m²\nHeizung 6,5 m²"])).toEqual([
      ["KG", "Keller", 12.3],
      ["KG", "Heizung", 6.5],
    ]);
    expect(kurz(["Keller\nVorrat 4,2 m²"])).toEqual([["KG", "Vorrat", 4.2]]);
  });

  it("trennt die Überschrift ab, wenn der erste Raum in derselben Textzeile steht (so liest unpdf CAD-Pläne)", () => {
    expect(kurz(["Grundriss Erdgeschoss Wohnen/Essen 32,45 m² Küche 11,20 m²\nWohnflaeche EG 43,65 m²", "Obergeschoss Bad 7,85 m²"])).toEqual([
      ["EG", "Wohnen/Essen", 32.45],
      ["EG", "Küche", 11.2],
      ["OG", "Bad", 7.85],
    ]);
  });

  it("liefert nichts bei leerem oder reinem Maßtext", () => {
    expect(raeumeAusText([])).toEqual([]);
    expect(raeumeAusText(["", "4,24 3,01 2,50\nM 1:100"])).toEqual([]);
  });
});

describe("raeumeAusKiAntwort", () => {
  it("übernimmt plausible Räume mit Quelle KI", () => {
    const r = raeumeAusKiAntwort({
      raeume: [
        { geschoss: "Erdgeschoss", name: " Wohnen ", boden_m2: 25.3 },
        { geschoss: "EG", name: "Wohnfläche gesamt", boden_m2: 85 },
        { geschoss: "EG", name: "Riesig", boden_m2: 900 },
        { geschoss: "EG", name: "", boden_m2: 5 },
      ],
    });
    expect(r?.map((x) => [x.geschoss, x.name, x.boden, x.quelle])).toEqual([["EG", "Wohnen", 25.3, "ki"]]);
  });

  it("lehnt eine kaputte Antwort ab", () => {
    expect(raeumeAusKiAntwort({ raeume: "nein" })).toBeNull();
    expect(raeumeAusKiAntwort(null)).toBeNull();
  });
});
