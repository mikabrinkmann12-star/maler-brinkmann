import { describe, expect, it } from "vitest";
import { angebotBerechnen, type Baustein } from "./angebot";
import { anweisungBlocks, arbeitsanweisungErzeugen, mengeText, saetze } from "./arbeitsanweisung";

let n = 0;
const b = (typ: Baustein["typ"], teil: Partial<Baustein> = {}): Baustein => ({
  id: `b${++n}`, typ, kurztext: "", langtext: "", menge: null, einheit: "", einzelpreis: null, bildPfad: null, ...teil,
});
const pos = (kurz: string, menge: number, einheit: string, preis: number, lang = "") =>
  b("position", { kurztext: kurz, langtext: lang, menge, einheit, einzelpreis: preis });
const rechne = (bausteine: Baustein[]) => angebotBerechnen(bausteine, { rabattProzent: 0, steuersatz: 19, reverseCharge: false }).zeilen;

describe("mengeText", () => {
  it("deutsche Zahl mit Einheit, Pauschalen als „pauschal“", () => {
    expect(mengeText(313.63, "m²")).toBe("313,63 m²");
    expect(mengeText(5, "Liter")).toBe("5 Liter");
    expect(mengeText(1, "psch")).toBe("pauschal");
    expect(mengeText(1, "Psch.")).toBe("pauschal");
    expect(mengeText(1234.5, "Lfm")).toBe("1.234,5 Lfm");
  });
});

describe("saetze", () => {
  it("zerlegt Langtext in Sätze und Zeilen", () => {
    expect(saetze("Zweimal streichen. Dispersionsfarbe verwenden.\nMöbel abdecken")).toEqual([
      "Zweimal streichen", "Dispersionsfarbe verwenden", "Möbel abdecken",
    ]);
  });
  it("trennt nicht bei Abkürzungen und Zahlen, entfernt Aufzählungszeichen", () => {
    expect(saetze("Z. B. 3. Etage streichen")).toEqual(["Z. B. 3. Etage streichen"]);
    expect(saetze("- Punkt eins\n• Punkt zwei")).toEqual(["Punkt eins", "Punkt zwei"]);
  });
  it("kürzt sehr lange Sätze", () => {
    expect(saetze("x".repeat(500))[0].length).toBeLessThanOrEqual(200);
  });
});

describe("arbeitsanweisungErzeugen", () => {
  const zeilen = rechne([
    b("titel", { kurztext: "Wohnzimmer" }),
    pos("Wandflächen weiß streichen", 313.63, "m²", 11.8, "Zweimal streichen. Möbel abdecken."),
    pos("Pauschale Baustelleneinrichtung", 1, "psch", 150),
    b("text", { langtext: "Schlüssel liegt beim Hausmeister" }),
    b("zwischensumme"),
    pos("Rabatt-Abzug", -1, "Stk", -50),
    b("titel", { kurztext: "Flur" }),
    pos("Decken streichen", 20, "m²", 6.5),
  ]);

  it("enthält Arbeit und Mengen, aber keine Preise", () => {
    const r = arbeitsanweisungErzeugen({ betreff: "Haus 2", adresse: "Technologiepark 10, 26129 Oldenburg", zeilen });
    expect(r.titel).toBe("Arbeitsanweisung: Haus 2");
    expect(r.inhalt).toBe([
      "Baustelle: Technologiepark 10, 26129 Oldenburg",
      "",
      "# Wohnzimmer",
      "- Wandflächen weiß streichen – 313,63 m²",
      "  - Zweimal streichen",
      "  - Möbel abdecken",
      "- Pauschale Baustelleneinrichtung – pauschal",
      "Hinweis: Schlüssel liegt beim Hausmeister",
      "",
      "# Flur",
      "- Decken streichen – 20 m²",
    ].join("\n"));
    expect(r.inhalt).not.toMatch(/€|11,80|150|3\.700|6,5/);
  });

  it("ohne Adresse keine Baustellenzeile; Position nur mit Langtext", () => {
    const r = arbeitsanweisungErzeugen({
      betreff: "X", adresse: "", zeilen: rechne([b("position", { langtext: "Erster Satz. Zweiter Satz.", menge: 2, einheit: "Stk", einzelpreis: 1 })]),
    });
    expect(r.inhalt).toBe("- Erster Satz – 2 Stk\n  - Zweiter Satz");
  });

  it("leeres Angebot gibt eine leere Anweisung", () => {
    expect(arbeitsanweisungErzeugen({ betreff: "X", adresse: "", zeilen: [] }).inhalt).toBe("");
  });
});

describe("anweisungBlocks", () => {
  it("erkennt Überschrift, Punkt, Unterpunkt, Absatz und Leerzeilen", () => {
    expect(anweisungBlocks("# Flur\n- Decke – 20 m²\n  - Weiß\nHinweis: x\n\nEnde")).toEqual([
      { art: "ueberschrift", text: "Flur" },
      { art: "punkt", text: "Decke – 20 m²" },
      { art: "unterpunkt", text: "Weiß" },
      { art: "absatz", text: "Hinweis: x" },
      { art: "leer" },
      { art: "absatz", text: "Ende" },
    ]);
  });
});
