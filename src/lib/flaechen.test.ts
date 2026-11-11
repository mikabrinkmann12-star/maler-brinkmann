import { describe, expect, it } from "vitest";
import { FLAECHEN_STANDARD, type LeistungsZeile, type Raum } from "./flaechen-typen";
import {
  bereichRaeume,
  geschosse,
  mengeLesen,
  raumArtVorschlag,
  raumFlaechen,
  rund2,
  sockelVorschlag,
  standardPruefen,
  zeilenMenge,
} from "./flaechen";

const S = FLAECHEN_STANDARD;
const raum = (o: Partial<Raum> = {}): Raum => ({
  id: "a",
  geschoss: "EG",
  name: "Wohnen",
  boden: 25,
  umfang: null,
  hoehe: null,
  decke: null,
  art: "normal",
  belag: false,
  sockel: false,
  geprueft: true,
  quelle: "hand",
  ...o,
});
const zeile = (o: Partial<LeistungsZeile> = {}): LeistungsZeile => ({
  id: "z",
  serviceId: "s",
  flaeche: "boden",
  bereich: { art: "alle" },
  ...o,
});

describe("raumFlaechen", () => {
  it("schätzt den Umfang", () => {
    const f = raumFlaechen(raum(), S);
    expect(f.umfang).toBe(21.5);
    expect(f.geschaetzt.umfang).toBe(true);
  });
  it("gemessener Umfang hat Vorrang", () => {
    const f = raumFlaechen(raum({ umfang: 20 }), S);
    expect(f.umfang).toBe(20);
    expect(f.geschaetzt.umfang).toBe(false);
  });
  it("Wand mit Abzug", () => expect(raumFlaechen(raum(), S).wand).toBe(48.38));
  it("Bad nur oberhalb der Fliesen", () => {
    expect(raumFlaechen(raum({ art: "nass" }), { ...S, fliesenhoehe: 1.5 }).wand).toBe(19.35);
  });
  it("Decke = Boden, Treppenhaus null, Handwert gilt", () => {
    expect(raumFlaechen(raum(), S).decke).toBe(25);
    expect(raumFlaechen(raum({ art: "treppenhaus" }), S).decke).toBeNull();
    expect(raumFlaechen(raum({ art: "treppenhaus", decke: 30 }), S).decke).toBe(30);
  });
  it("Sockel nur mit Belag und sockel=true", () => {
    expect(raumFlaechen(raum({ belag: true, sockel: true }), S).sockel).toBe(21.5);
    expect(raumFlaechen(raum({ belag: true, sockel: false }), S).sockel).toBe(0);
    expect(raumFlaechen(raum({ belag: false, sockel: true }), S).sockel).toBe(0);
  });
});

describe("zeilenMenge", () => {
  it("Fehler bei ungeprüftem Raum", () => {
    const r = zeilenMenge([raum({ geprueft: false, name: "Flur" })], zeile(), S);
    expect(r.fehler).toBe("Im Bereich sind noch ungeprüfte Räume: Flur.");
  });
  it("Fehler ohne Räume und ohne Boden", () => {
    expect(zeilenMenge([], zeile(), S).fehler).toBe("Im Bereich gibt es keine Räume.");
    expect(zeilenMenge([raum({ boden: null, name: "X" })], zeile(), S).fehler).toBe("Bodenfläche fehlt: X.");
  });
  it("Fehler bei Treppenhaus-Decke", () => {
    const r = zeilenMenge([raum({ art: "treppenhaus", name: "TH" })], zeile({ flaeche: "decke" }), S);
    expect(r.fehler).toBe("Deckenfläche im Treppenhaus fehlt: TH.");
  });
  it("Summe je Geschoss", () => {
    const rs = [raum({ id: "1", boden: 10 }), raum({ id: "2", boden: 15.5 }), raum({ id: "3", geschoss: "OG", boden: 40 })];
    expect(zeilenMenge(rs, zeile({ bereich: { art: "geschoss", geschoss: "EG" } }), S).menge).toBe(25.5);
    expect(zeilenMenge(rs, zeile(), S).menge).toBe(65.5);
    expect(bereichRaeume(rs, { art: "raeume", ids: ["3"] })).toHaveLength(1);
    expect(geschosse(rs)).toEqual(["EG", "OG"]);
  });
});

describe("Vorschläge", () => {
  it("raumArtVorschlag", () => {
    for (const n of ["Bad", "Gäste-WC", "Bad/WC", "Duschbad", "Badezimmer", "WC", "Toilette"]) {
      expect(raumArtVorschlag(n)).toBe("nass");
    }
    expect(raumArtVorschlag("Treppenhaus")).toBe("treppenhaus");
    expect(raumArtVorschlag("Treppe")).toBe("treppenhaus");
    for (const n of ["Technik", "HAR", "Hausanschlussraum", "Heizung"]) expect(raumArtVorschlag(n)).toBe("technik");
    expect(raumArtVorschlag("Abstellraum")).toBe("normal");
    expect(raumArtVorschlag("Schlafzimmer")).toBe("normal");
  });
  it("sockelVorschlag", () => {
    expect(sockelVorschlag("normal")).toBe(true);
    expect(sockelVorschlag("nass")).toBe(false);
  });
});

describe("Hilfen", () => {
  it("standardPruefen mit Müll", () => {
    expect(standardPruefen(null)).toEqual(S);
    expect(standardPruefen({ umfangFaktor: "x", raumhoehe: 99, abzugProzent: NaN, fliesenhoehe: -1 })).toEqual(S);
    const ok = { umfangFaktor: 5, raumhoehe: 2.7, abzugProzent: 15, fliesenhoehe: 2 };
    expect(standardPruefen(ok)).toEqual(ok);
  });
  it("mengeLesen", () => {
    expect(mengeLesen("12,5")).toBe(12.5);
    expect(mengeLesen("1.234,56")).toBe(1234.56);
    expect(mengeLesen(" 7 ")).toBe(7);
    expect(mengeLesen("")).toBeNull();
    expect(mengeLesen("abc")).toBeNull();
    expect(mengeLesen("-3")).toBeNull();
  });
  it("rund2", () => expect(rund2(2.345678)).toBe(2.35));
});
