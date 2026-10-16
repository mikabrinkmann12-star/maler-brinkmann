import { describe, expect, it } from "vitest";
import {
  VORLAGE_CSV,
  entwurfSchluessel,
  importStatus,
  materialSchluessel,
  materialienAusCsv,
  ordnerPfadLesen,
} from "./katalog-import";

describe("ordnerPfadLesen", () => {
  it("zerlegt Pfade mit >, / und ›", () => {
    expect(ordnerPfadLesen("Farben > Dispersion")).toEqual(["Farben", "Dispersion"]);
    expect(ordnerPfadLesen("Farben/Lacke / Weiß")).toEqual(["Farben", "Lacke", "Weiß"]);
    expect(ordnerPfadLesen("Farben › Dispersion")).toEqual(["Farben", "Dispersion"]);
    expect(ordnerPfadLesen("  ")).toEqual([]);
    expect(ordnerPfadLesen("Tapeten")).toEqual(["Tapeten"]);
  });
});

describe("materialienAusCsv", () => {
  it("liest die Vorlage (Semikolon, deutsche Zahlen)", () => {
    const r = materialienAusCsv(VORLAGE_CSV);
    expect(r.fehlendeSpalten).toEqual([]);
    expect(r.zeilen).toHaveLength(2);
    expect(r.zeilen[0].entwurf).toEqual({
      ordner: ["Farben", "Dispersion"], artikelnr: "DF-125", name: "Dispersionsfarbe weiß 12,5 l", lieferant: "Wilts",
      einheit: "Eimer", ek: 19.99, zuschlag: 30, beschreibung: "Innen, matt",
    });
    expect(r.zeilen[1].entwurf).toMatchObject({ ordner: ["Zubehör"], artikelnr: "", ek: 2.49, zuschlag: 40 });
    expect(r.zeilen[0].zeile).toBe(2);
  });

  it("erkennt Spalten-Synonyme und beliebige Reihenfolge", () => {
    const r = materialienAusCsv("Art.-Nr.;Artikel;ME;EK;Warengruppe\n123;Pinsel;Stk;3,5;Zubehör");
    expect(r.fehlendeSpalten).toEqual([]);
    expect(r.zeilen[0].entwurf).toMatchObject({ artikelnr: "123", name: "Pinsel", einheit: "Stk", ek: 3.5, ordner: ["Zubehör"], zuschlag: 0 });
  });

  it("meldet fehlende Pflichtspalten", () => {
    expect(materialienAusCsv("Bezeichnung;Einheit\nA;Stk").fehlendeSpalten).toEqual(["Einkaufspreis"]);
    expect(materialienAusCsv("x;y\n1;2").fehlendeSpalten).toEqual(["Bezeichnung", "Einheit", "Einkaufspreis"]);
  });

  it("berechnet fehlenden Zuschlag aus dem Verkaufspreis", () => {
    const r = materialienAusCsv("Bezeichnung;Einheit;Einkaufspreis;Verkaufspreis\nFarbe;Eimer;20,00;26,00");
    expect(r.zeilen[0].entwurf?.zuschlag).toBe(30);
    expect(r.zeilen[0].hinweis).toContain("aus dem Verkaufspreis");
  });

  it("ein angegebener Zuschlag gilt, der Verkaufspreis wird ignoriert", () => {
    const r = materialienAusCsv("Bezeichnung;Einheit;Einkaufspreis;Zuschlag;Verkaufspreis\nFarbe;Eimer;20,00;25;99,00");
    expect(r.zeilen[0].entwurf?.zuschlag).toBe(25);
    expect(r.zeilen[0].hinweis).toBeUndefined();
  });

  it("fehlerhafte Zeilen bekommen eine verständliche Meldung, der Rest wird trotzdem gelesen", () => {
    const r = materialienAusCsv("Bezeichnung;Einheit;Einkaufspreis\nGut;Stk;1,00\n;Stk;1,00\nPreis kaputt;Stk;teuer\nOhne Einheit;;2");
    expect(r.zeilen.map((z) => Boolean(z.entwurf))).toEqual([true, false, false, false]);
    expect(r.zeilen[1].fehler).toContain("Bezeichnung");
    expect(r.zeilen[2].fehler).toContain("Einkaufspreis");
    expect(r.zeilen[3].fehler).toContain("Einheit");
  });

  it("zu tiefe Ordnerpfade sind ein Fehler", () => {
    const r = materialienAusCsv("Ordner;Bezeichnung;Einheit;Einkaufspreis\na>b>c>d>e>f>g;X;Stk;1");
    expect(r.zeilen[0].fehler).toContain("zu tief");
  });

  it("liest Anführungszeichen und Zeilenumbrüche in Feldern (Excel-Export)", () => {
    const r = materialienAusCsv('Bezeichnung;Einheit;Einkaufspreis;Beschreibung\r\n"Farbe; weiß";Eimer;1,5;"Zeile 1\nZeile 2"');
    expect(r.zeilen[0].entwurf).toMatchObject({ name: "Farbe; weiß", beschreibung: "Zeile 1\nZeile 2" });
  });

  it("verarbeitet höchstens 5000 Zeilen", () => {
    const viele = "Bezeichnung;Einheit;Einkaufspreis\n" + Array.from({ length: 5001 }, (_, i) => `A${i};Stk;1`).join("\n");
    expect(materialienAusCsv(viele).zuViele).toBe(true);
  });
});

describe("Dubletten", () => {
  it("mit Artikelnummer: gleiche Nummer beim gleichen Lieferanten, egal wie geschrieben", () => {
    const a = materialSchluessel({ artikelnr: "DF-125", lieferant: "Wilts", name: "A", einheit: "Eimer", ordnerPfad: "x" });
    const b = materialSchluessel({ artikelnr: "df 125", lieferant: "WILTS", name: "ganz anders", einheit: "Stk", ordnerPfad: "y" });
    expect(a).toBe(b);
    expect(a).not.toBe(materialSchluessel({ artikelnr: "DF-125", lieferant: "Brillux", name: "A", einheit: "Eimer", ordnerPfad: "x" }));
  });

  it("ohne Artikelnummer: gleicher Name, Einheit und Ordner", () => {
    const a = materialSchluessel({ artikelnr: "", lieferant: "", name: "Malerkrepp 50 m", einheit: "Rolle", ordnerPfad: "Zubehör" });
    expect(a).toBe(materialSchluessel({ artikelnr: " ", lieferant: "Egal", name: "malerkrepp 50 M", einheit: "rolle", ordnerPfad: "zubehör" }));
    expect(a).not.toBe(materialSchluessel({ artikelnr: "", lieferant: "", name: "Malerkrepp 50 m", einheit: "Rolle", ordnerPfad: "Farben" }));
  });

  it("importStatus: neu, schon vorhanden, doppelt in der Datei, Fehler", () => {
    const r = materialienAusCsv("Ordner;Artikelnummer;Bezeichnung;Lieferant;Einheit;Einkaufspreis\nA;1;X;W;Stk;1\nA;2;Y;W;Stk;1\nA;2;Y;W;Stk;5\nA;3;Z;W;Stk;kaputt");
    const vorhanden = new Set([entwurfSchluessel(r.zeilen[0].entwurf!)]);
    expect(importStatus(r.zeilen, vorhanden)).toEqual(["vorhanden", "neu", "doppelt_in_datei", "fehler"]);
  });
});
