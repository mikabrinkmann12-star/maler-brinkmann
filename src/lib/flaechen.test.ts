import { describe, expect, it } from "vitest";
import { FLAECHEN_STANDARD, type LeistungsZeile, type Raum, type RaumArt } from "./flaechen-typen";
import {
  bereichRaeume,
  flaechenSummen,
  geschosse,
  mengeLesen,
  raumFlaechen,
  rund2,
  sockelVorschlag,
  standardPruefen,
  wohnungen,
  zeilenMenge,
} from "./flaechen";

const S = FLAECHEN_STANDARD;
const raum = (o: Partial<Raum> = {}): Raum => ({
  id: "a",
  geschoss: "EG",
  wohnung: "",
  name: "Wohnen",
  boden: 25,
  umfang: null,
  hoehe: null,
  decke: null,
  art: "wohnraum",
  sockel: false,
  seite: 0,
  quelle: "hand",
  ...o,
});
const zeile = (o: Partial<LeistungsZeile> = {}): LeistungsZeile => ({
  id: "z",
  serviceId: "s",
  flaeche: "boden",
  bereich: { art: "wohnungen" },
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
  it("Bad und WC nur oberhalb der Fliesen", () => {
    expect(raumFlaechen(raum({ art: "bad" }), S).wand).toBe(19.35);
    expect(raumFlaechen(raum({ art: "wc" }), S).wand).toBe(19.35);
  });
  it("Decke = Boden, Treppenhaus null, Handwert gilt", () => {
    expect(raumFlaechen(raum(), S).decke).toBe(25);
    expect(raumFlaechen(raum({ art: "treppenhaus" }), S).decke).toBeNull();
    expect(raumFlaechen(raum({ art: "treppenhaus", decke: 30 }), S).decke).toBe(30);
  });
  it("Sockel nur mit sockel=true", () => {
    expect(raumFlaechen(raum({ sockel: true }), S).sockel).toBe(21.5);
    expect(raumFlaechen(raum({ sockel: false }), S).sockel).toBe(0);
  });
  it("Außenfläche: alles 0", () => {
    const f = raumFlaechen(raum({ art: "aussen", sockel: true, decke: 5 }), S);
    expect(f).toMatchObject({ boden: 0, decke: 0, wand: 0, sockel: 0, umfang: 0 });
    expect(f.geschaetzt).toEqual({ umfang: false, wand: false, decke: false, sockel: false });
  });
  it("sockelVorschlag", () => {
    expect(sockelVorschlag("wohnraum")).toBe(true);
    for (const a of ["bad", "wc", "treppenhaus", "technik", "nebengebaeude", "aussen"] as RaumArt[]) expect(sockelVorschlag(a)).toBe(false);
  });
});

describe("bereichRaeume und zeilenMenge", () => {
  const rs = [
    raum({ id: "1", boden: 10, wohnung: "A" }),
    raum({ id: "2", boden: 5, art: "bad", wohnung: "A" }),
    raum({ id: "3", boden: 20, geschoss: "OG", wohnung: "B" }),
    raum({ id: "4", boden: 15, art: "treppenhaus", decke: 15 }),
    raum({ id: "5", boden: 7, art: "technik" }),
    raum({ id: "6", boden: 9, art: "nebengebaeude" }),
    raum({ id: "7", boden: 4, art: "aussen" }),
  ];
  const ids = (b: Parameters<typeof bereichRaeume>[1]) => bereichRaeume(rs, b).map((r) => r.id);
  it("wohnungen: nur Wohnungsräume", () => {
    expect(ids({ art: "wohnungen" })).toEqual(["1", "2", "3"]);
    expect(ids({ art: "wohnungen", geschoss: "OG" })).toEqual(["3"]);
    expect(ids({ art: "wohnungen", ohneNass: true })).toEqual(["1", "3"]);
  });
  it("wohnung", () => expect(ids({ art: "wohnung", wohnung: "A" })).toEqual(["1", "2"]));
  it("raumart: Treppenhaus/Technik/Nebengebäude nur ausdrücklich", () => {
    expect(ids({ art: "raumart", raumArt: "treppenhaus" })).toEqual(["4"]);
    expect(ids({ art: "raumart", raumArt: "technik" })).toEqual(["5"]);
    expect(ids({ art: "raumart", raumArt: "nebengebaeude" })).toEqual(["6"]);
  });
  it("raeume: nie Außenflächen", () => expect(ids({ art: "raeume", ids: ["1", "7", "4"] })).toEqual(["1", "4"]));
  it("Außenfläche zählt nirgends", () => {
    expect(zeilenMenge(rs, zeile({ flaeche: "boden" }), S).menge).toBe(35);
    expect(zeilenMenge(rs, zeile({ flaeche: "boden", bereich: { art: "raeume", ids: ["7"] } }), S).fehler).toBe("Im Bereich gibt es keine Räume.");
  });
  it("ohneNass", () => expect(zeilenMenge(rs, zeile({ bereich: { art: "wohnungen", ohneNass: true } }), S).menge).toBe(30));
  it("Fehler ohne Räume und ohne Boden", () => {
    expect(zeilenMenge([], zeile(), S).fehler).toBe("Im Bereich gibt es keine Räume.");
    expect(zeilenMenge([raum({ boden: null, name: "X" })], zeile(), S).fehler).toBe("Bodenfläche fehlt: X.");
    expect(zeilenMenge([raum({ boden: 0, name: "Y" })], zeile(), S).fehler).toBe("Bodenfläche fehlt: Y.");
  });
  it("Fehler bei Treppenhaus-Decke", () => {
    const r = zeilenMenge([raum({ art: "treppenhaus", name: "TH" })], zeile({ flaeche: "decke", bereich: { art: "raumart", raumArt: "treppenhaus" } }), S);
    expect(r.fehler).toBe("Deckenfläche im Treppenhaus fehlt: TH.");
  });
  it("geschosse und wohnungen", () => {
    expect(geschosse(rs)).toEqual(["EG", "OG"]);
    expect(wohnungen(rs)).toEqual(["A", "B"]);
  });
});

describe("Prüfwerte Am Dobben (DIN-F)", () => {
  let n = 0;
  const r = (geschoss: string, name: string, boden: number, art: RaumArt = "wohnraum", wohnung = ""): Raum =>
    raum({ id: String(++n), geschoss, name, boden, art, wohnung });
  const wohnEG = (w: string, g: string) => [
    r(g, "Gäste WC", 1.67, "wc", w),
    r(g, "Diele / Garderobe", 8.4, "wohnraum", w),
    r(g, "Wohnen/Essen/Küche", 29.25, "wohnraum", w),
    r(g, "Bad", 8.35, "bad", w),
    r(g, "Schlafen", 12.65, "wohnraum", w),
    r(g, "Büro (privat) / Gast", 10.44, "wohnraum", w),
    r(g, "HWR", 6.01, "wohnraum", w),
  ];
  const EG = "Erdgeschoss";
  const OG1 = "1. Obergeschoss";
  const OG2 = "2. Obergeschoss";
  const alle: Raum[] = [
    ...wohnEG("W1", EG),
    ...wohnEG("W2", EG),
    r(EG, "Treppenhaus EG", 14.99, "treppenhaus"),
    r(EG, "Fahrräder/Geräte", 21.55, "nebengebaeude"),
    r(EG, "Technik", 9.34, "technik"),
    r(EG, "Terrasse (teilüberdacht)", 4.5, "aussen"),
    r(EG, "Terrasse (teilüberdacht)", 4.5, "aussen"),
    ...wohnEG("W3", OG1),
    ...wohnEG("W4", OG1),
    r(OG1, "Treppenhaus 1.OG", 12.26, "treppenhaus"),
    r(OG1, "Balkon", 3, "aussen"),
    r(OG1, "Balkon", 3, "aussen"),
    r(OG2, "Bad", 11.87, "bad"),
    r(OG2, "Wohnen/Essen/Küche", 41.87),
    r(OG2, "Wäscheraum", 1.97),
    r(OG2, "Büro (privat) / Gast", 12.07),
    r(OG2, "Gäste WC", 3.8, "wc"),
    r(OG2, "Diele", 5.48),
    r(OG2, "Schlafen 01", 18.63),
    r(OG2, "Ankleide", 4.2),
    r(OG2, "Treppenhaus 2.OG", 2.66, "treppenhaus"),
    r(OG2, "Dachterrasse (teilüberdacht)", 18.83, "aussen"),
  ];
  it("Summen", () => {
    const s = flaechenSummen(alle, S);
    expect(s.wohnungen.boden).toBe(406.97);
    expect(s.wohnungen.bodenOhneNass).toBe(351.22);
    expect(s.geschosse.map((g) => g.geschoss)).toEqual([EG, OG1, OG2]);
    expect(s.geschosse.map((g) => g.boden)).toEqual([153.54, 153.54, 99.89]);
    expect(s.geschosse.some((g) => g.deckeFehlt)).toBe(false);
    expect(s.sonderraeume).toEqual([
      { art: "treppenhaus", boden: 29.91, anzahl: 3 },
      { art: "technik", boden: 9.34, anzahl: 1 },
      { art: "nebengebaeude", boden: 21.55, anzahl: 1 },
    ]);
    expect(s.aussen).toEqual({ boden: 33.83, anzahl: 5 });
  });
  it("zeilenMenge", () => {
    expect(zeilenMenge(alle, zeile({ bereich: { art: "wohnungen" } }), S).menge).toBe(406.97);
    expect(zeilenMenge(alle, zeile({ bereich: { art: "wohnungen", ohneNass: true } }), S).menge).toBe(351.22);
    expect(zeilenMenge(alle, zeile({ bereich: { art: "raumart", raumArt: "treppenhaus" } }), S).menge).toBe(29.91);
  });
  it("Außenflächen in keiner Summe", () => {
    const ohne = alle.filter((x) => x.art !== "aussen");
    expect(flaechenSummen(ohne, S).wohnungen).toEqual(flaechenSummen(alle, S).wohnungen);
    expect(zeilenMenge(alle, zeile({ flaeche: "decke" }), S).menge).toBe(zeilenMenge(ohne, zeile({ flaeche: "decke" }), S).menge);
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
