import { describe, expect, it } from "vitest";
import {
  VORLAGE_CSV,
  entwurfSchluessel,
  importStatus,
  katalogSchluessel,
  leistungenAusCsv,
  materialienAusCsv,
  ordnerPfadLesen,
} from "./katalog-import";

describe("ordnerPfadLesen", () => {
  it("zerlegt Pfade mit > und ›, ein / bleibt im Namen", () => {
    expect(ordnerPfadLesen("Farben > Dispersion")).toEqual(["Farben", "Dispersion"]);
    expect(ordnerPfadLesen("Farben/ Lacke/ Spray")).toEqual(["Farben/ Lacke/ Spray"]);
    expect(ordnerPfadLesen("Farben/ Lacke > Weiß")).toEqual(["Farben/ Lacke", "Weiß"]);
    expect(ordnerPfadLesen("Farben › Dispersion")).toEqual(["Farben", "Dispersion"]);
    expect(ordnerPfadLesen("  ")).toEqual([]);
    expect(ordnerPfadLesen("Tapeten")).toEqual(["Tapeten"]);
  });
});

describe("materialienAusCsv", () => {
  it("liest die Vorlage (Semikolon, deutsche Zahlen)", () => {
    const r = materialienAusCsv(VORLAGE_CSV.material);
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
  const basis = { artikelnr: "", lieferant: "", name: "Malerkrepp 50 m", einheit: "Rolle", ek: 2.49, ordnerPfad: "Zubehör" };

  it("mit Artikelnummer: gleiche Nummer beim gleichen Lieferanten, egal wie geschrieben", () => {
    const a = katalogSchluessel({ ...basis, artikelnr: "DF-125", lieferant: "Wilts" });
    const b = katalogSchluessel({ ...basis, artikelnr: "df 125", lieferant: "WILTS", name: "ganz anders", einheit: "Stk", ek: 99 });
    expect(a).toBe(b);
    expect(a).not.toBe(katalogSchluessel({ ...basis, artikelnr: "DF-125", lieferant: "Brillux" }));
  });

  it("ohne Nummer: gleicher Name, Einheit, Lieferant, Ordner und Preis", () => {
    const a = katalogSchluessel(basis);
    expect(a).toBe(katalogSchluessel({ ...basis, artikelnr: " ", name: "malerkrepp  50 M", einheit: "rolle", ordnerPfad: "zubehör" }));
    expect(a).not.toBe(katalogSchluessel({ ...basis, ordnerPfad: "Farben" }));
    expect(a).not.toBe(katalogSchluessel({ ...basis, lieferant: "Wilts" }));
  });

  it("gleicher Name mit anderem Preis ist ein eigener Eintrag (zwei Preisstände)", () => {
    expect(katalogSchluessel(basis)).not.toBe(katalogSchluessel({ ...basis, ek: 2.5 }));
  });

  it("kleine Schreibunterschiede im Namen (PG1-S / PG 1-S) sind keine Dubletten", () => {
    expect(katalogSchluessel({ ...basis, name: "Indeko PG1-S 7,5L" })).not.toBe(katalogSchluessel({ ...basis, name: "Indeko PG 1-S 7,5L" }));
  });

  it("importStatus: neu, schon vorhanden, doppelt in der Datei, Fehler", () => {
    const csv = ["Ordner;Artikelnummer;Bezeichnung;Lieferant;Einheit;Einkaufspreis", "A;1;X;W;Stk;1", "A;2;Y;W;Stk;1", "A;2;Y;W;Stk;5", "A;3;Z;W;Stk;kaputt"].join("\n");
    const r = materialienAusCsv(csv);
    const vorhanden = new Set([entwurfSchluessel(r.zeilen[0].entwurf!)]);
    expect(importStatus(r.zeilen, vorhanden)).toEqual(["vorhanden", "neu", "doppelt_in_datei", "fehler"]);
  });
});

describe("Leistungen", () => {
  it("liest Kurztext, Langtext, Kosten; Nummer landet in artikelnr", () => {
    const r = leistungenAusCsv(VORLAGE_CSV.leistung);
    expect(r.fehlendeSpalten).toEqual([]);
    expect(r.zeilen[0].entwurf).toEqual({
      ordner: ["Malerarbeiten"], artikelnr: "01.0010", name: "Wandflächen weiß streichen", lieferant: "",
      einheit: "m²", ek: 5.65, zuschlag: 0, beschreibung: "Zweimal streichen, Dispersionsfarbe",
    });
  });

  it("verlangt Kurztext, Einheit und Kosten", () => {
    expect(leistungenAusCsv(["Bezeichnung;Einheit", "A;Stk"].join("\n")).fehlendeSpalten).toEqual(["Kosten"]);
    expect(leistungenAusCsv(["x", "1"].join("\n")).fehlendeSpalten).toEqual(["Kurztext", "Einheit", "Kosten"]);
  });

  it("Langtext bis 5.000 Zeichen und mit Zeilenumbrüchen", () => {
    const lang = ["Zeile 1", "Zeile 2 " + "x".repeat(3000)].join("\n");
    const kopf = "Kurztext;Einheit;Kosten;Langtext\r\n";
    const r = leistungenAusCsv(`${kopf}Gerüst;Stk;0;"${lang}"`);
    expect(r.zeilen[0].entwurf?.beschreibung).toBe(lang);
    expect(leistungenAusCsv(`${kopf}Gerüst;Stk;0;"${"x".repeat(5001)}"`).zeilen[0].fehler).toContain("Langtext");
  });

  it("Zuschlag aus Verkaufspreis, Ordner mit / im Namen bleibt ein Ordner", () => {
    const r = leistungenAusCsv(["Ordner;Kurztext;Einheit;Kosten;Verkaufspreis", "Farben/ Lacke;Streichen;m²;10,00;12,50"].join("\n"));
    expect(r.zeilen[0].entwurf).toMatchObject({ ordner: ["Farben/ Lacke"], zuschlag: 25 });
  });
});
