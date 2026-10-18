import { describe, expect, it } from "vitest";
import { ZEIT_ARTEN } from "./zeiten";
import {
  ZEIT_ART_EMOJI,
  csvStunden,
  csvText,
  eintraegeFiltern,
  eintraegeSortieren,
  einzelCsv,
  filterLesen,
  gesamtSumme,
  kennzahlen,
  nachTagGruppieren,
  pauseText,
  summenCsv,
  summenJePerson,
  vorkommendeArten,
  zeitenFiltern,
  type AuswertungEintrag,
} from "./zeiten-auswertung";

const ANNA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";
const namen = new Map([
  [ANNA, "Anna Muster"],
  [BEN, "Ben Beispiel"],
]);

function e(teil: Partial<AuswertungEintrag>): AuswertungEintrag {
  return {
    id: crypto.randomUUID(),
    userId: ANNA,
    datum: "2026-10-05",
    von: "06:30:00",
    bis: "15:45:00",
    pauseMin: 45,
    stunden: 8.5,
    art: "arbeitszeit",
    projektId: P1,
    projektName: "Musterstraße 1",
    projektNummer: "P-(2600)001",
    beschreibung: "",
    ...teil,
  };
}

describe("filterLesen", () => {
  it("übernimmt gültige Werte", () => {
    expect(filterLesen({ person: ANNA, projekt: P1, art: "krank" })).toEqual({ personId: ANNA, projektId: P1, art: "krank" });
  });
  it("ignoriert Unsinn und Fremdes", () => {
    expect(filterLesen({ person: "abc", projekt: ["x"], art: "gehalt" })).toEqual({ personId: "", projektId: "", art: "" });
    expect(filterLesen({})).toEqual({ personId: "", projektId: "", art: "" });
  });
});

describe("eintraegeFiltern", () => {
  const alle = [e({ userId: ANNA }), e({ userId: BEN, art: "krank", projektId: null }), e({ userId: BEN, projektId: "x" })];
  it("ohne Filter bleibt alles", () => {
    expect(eintraegeFiltern(alle, { personId: "", projektId: "", art: "" })).toHaveLength(3);
  });
  it("nach Person, Projekt und Art (kombinierbar)", () => {
    expect(eintraegeFiltern(alle, { personId: BEN, projektId: "", art: "" })).toHaveLength(2);
    expect(eintraegeFiltern(alle, { personId: "", projektId: P1, art: "" })).toHaveLength(1);
    expect(eintraegeFiltern(alle, { personId: BEN, projektId: "", art: "krank" })).toHaveLength(1);
  });
});

describe("eintraegeSortieren", () => {
  it("Datum, dann Name, dann Beginn – ohne das Original zu ändern", () => {
    const a = e({ userId: BEN, datum: "2026-10-05" });
    const b = e({ userId: ANNA, datum: "2026-10-05", von: "12:00:00" });
    const c = e({ userId: ANNA, datum: "2026-10-05", von: "06:30:00" });
    const d = e({ userId: ANNA, datum: "2026-10-04" });
    const original = [a, b, c, d];
    expect(eintraegeSortieren(original, namen)).toEqual([d, c, b, a]);
    expect(original[0]).toBe(a);
  });
});

describe("summenJePerson", () => {
  it("summiert je Person und Art und sortiert nach Name", () => {
    const s = summenJePerson(
      [
        e({ userId: BEN, stunden: 8.5 }),
        e({ userId: ANNA, stunden: 8.5 }),
        e({ userId: ANNA, stunden: 6, datum: "2026-10-09" }),
        e({ userId: ANNA, art: "krank", stunden: 8.5, projektId: null }),
      ],
      namen,
    );
    expect(s.map((x) => x.name)).toEqual(["Anna Muster", "Ben Beispiel"]);
    expect(s[0].jeArt).toEqual({ arbeitszeit: 14.5, krank: 8.5 });
    expect(s[0].gesamt).toBe(23);
    expect(s[1].gesamt).toBe(8.5);
  });
  it("rechnet ohne Fließkomma-Reste", () => {
    const s = summenJePerson([e({ stunden: 0.1 }), e({ stunden: 0.2 })], namen);
    expect(s[0].gesamt).toBe(0.3);
  });
  it("unbekannte Person bekommt einen Platzhalter-Namen", () => {
    expect(summenJePerson([e({ userId: "fremd" })], namen)[0].name).toBe("Unbekannt");
  });
});

describe("vorkommendeArten / gesamtSumme", () => {
  const summen = summenJePerson(
    [e({ userId: ANNA }), e({ userId: BEN, art: "krank", projektId: null, stunden: 4 }), e({ userId: BEN, art: "fahrtzeit", stunden: 0.5 })],
    namen,
  );
  it("nur Arten mit Stunden, in der Reihenfolge der App", () => {
    expect(vorkommendeArten(summen)).toEqual(["arbeitszeit", "fahrtzeit", "krank"]);
  });
  it("Gesamtzeile", () => {
    const g = gesamtSumme(summen);
    expect(g.jeArt).toEqual({ arbeitszeit: 8.5, fahrtzeit: 0.5, krank: 4 });
    expect(g.gesamt).toBe(13);
  });
  it("leer", () => {
    expect(vorkommendeArten([])).toEqual([]);
    expect(gesamtSumme([]).gesamt).toBe(0);
  });
});

describe("CSV", () => {
  it("Stunden mit Dezimalkomma", () => {
    expect(csvStunden(8.5)).toBe("8,50");
    expect(csvStunden(0)).toBe("0,00");
    expect(csvStunden(7.33)).toBe("7,33");
  });

  it("Text mit Semikolon, Anführungszeichen oder Zeilenumbruch wird eingepackt", () => {
    expect(csvText("a;b")).toBe('"a;b"');
    expect(csvText('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(csvText("zwei\nZeilen")).toBe('"zwei\nZeilen"');
    expect(csvText("normal")).toBe("normal");
  });

  it("entschärft Formeln (CSV-Injection)", () => {
    expect(csvText("=SUMME(A1)")).toBe("'=SUMME(A1)");
    expect(csvText("+49 4492")).toBe("'+49 4492");
    expect(csvText("-1")).toBe("'-1");
    expect(csvText("@bezug")).toBe("'@bezug");
    expect(csvText('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
  });

  it("Summen-CSV: Kopf, eine Zeile je Person, Gesamtzeile", () => {
    const summen = summenJePerson([e({ userId: ANNA }), e({ userId: BEN, art: "krank", projektId: null, stunden: 4 })], namen);
    const zeilen = summenCsv(summen).split("\r\n");
    expect(zeilen).toEqual([
      "Mitarbeiter;Arbeitszeit;Krank;Summe",
      "Anna Muster;8,50;0,00;8,50",
      "Ben Beispiel;0,00;4,00;4,00",
      "Gesamt;8,50;4,00;12,50",
      "",
    ]);
  });

  it("Einzel-CSV mit deutschem Datum, Uhrzeiten und Beschreibung", () => {
    const csv = einzelCsv(
      [
        e({ beschreibung: "Wand; Decke" }),
        e({ von: null, bis: null, pauseMin: 0, art: "krank", projektId: null, projektName: "", projektNummer: "", stunden: 8.5 }),
      ],
      namen,
    );
    const zeilen = csv.split("\r\n");
    expect(zeilen[0]).toBe("Datum;Mitarbeiter;Art;Von;Bis;Pause (Min);Stunden;Projektnummer;Projekt;Beschreibung");
    expect(zeilen[1]).toBe('05.10.2026;Anna Muster;Arbeitszeit;06:30;15:45;45;8,50;P-(2600)001;Musterstraße 1;"Wand; Decke"');
    expect(zeilen[2]).toBe("05.10.2026;Anna Muster;Krank;;;;8,50;;;");
  });
});

describe("Zeiten-Seite wie Plancraft", () => {
  const e = (teil: Partial<AuswertungEintrag>): AuswertungEintrag => ({
    id: Math.random().toString(36).slice(2), userId: "u1", datum: "2026-10-16", von: "06:30:00", bis: "15:45:00", pauseMin: 45, stunden: 8.5,
    art: "arbeitszeit", projektId: "p1", projektName: "Neubau 5", projektNummer: "P-(2400)351", beschreibung: "Streichen", ...teil,
  });
  const namen = new Map([["u1", "Mika Brinkmann"], ["u2", "Carmen Bronn"]]);
  const leer = { personIds: [], projektIds: [], arten: [], q: "" };

  it("zeitenFiltern: Mehrfachfilter und Suche", () => {
    const liste = [e({}), e({ userId: "u2", art: "krank", projektId: null, projektName: "", projektNummer: "", beschreibung: "" })];
    expect(zeitenFiltern(liste, leer, namen)).toHaveLength(2);
    expect(zeitenFiltern(liste, { ...leer, personIds: ["u2"] }, namen)).toHaveLength(1);
    expect(zeitenFiltern(liste, { ...leer, arten: ["krank", "urlaub"] }, namen)).toHaveLength(1);
    expect(zeitenFiltern(liste, { ...leer, projektIds: ["p1"] }, namen)).toHaveLength(1);
    expect(zeitenFiltern(liste, { ...leer, q: "carmen" }, namen)).toHaveLength(1);
    expect(zeitenFiltern(liste, { ...leer, q: "streichen" }, namen)).toHaveLength(1);
    expect(zeitenFiltern(liste, { ...leer, q: "krank" }, namen)).toHaveLength(1);
  });

  it("kennzahlen: Stunden je Art, Tage je Person und Tag einmal, Pause in Stunden", () => {
    const k = kennzahlen([
      e({ stunden: 6, pauseMin: 15 }),
      e({ stunden: 1.5, pauseMin: 15, von: "07:00:00" }), // gleicher Tag, gleiche Person
      e({ art: "krank", stunden: 6, von: null, bis: null, pauseMin: 0 }),
      e({ art: "krank", stunden: 6, datum: "2026-10-17", von: null, bis: null, pauseMin: 0 }),
    ]);
    expect(k.jeArt.arbeitszeit).toEqual({ stunden: 7.5, tage: 1 });
    expect(k.jeArt.krank).toEqual({ stunden: 12, tage: 2 });
    expect(k.gesamtStunden).toBe(19.5);
    expect(k.gesamtPause).toBe(0.5);
  });

  it("nachTagGruppieren: Summenzeile nur bei mehreren Einträgen einer Person am Tag", () => {
    const g = nachTagGruppieren([
      e({ stunden: 1.5, pauseMin: 15 }),
      e({ stunden: 6.25, pauseMin: 15 }),
      e({ userId: "u2", stunden: 8.5 }),
      e({ datum: "2026-10-15", stunden: 8.5 }),
    ]);
    expect(g).toHaveLength(3);
    expect(g[0].summe).toEqual({ stunden: 7.75, pauseMin: 30 });
    expect(g[1].summe).toBeNull();
    expect(g[2].summe).toBeNull();
  });

  it("pauseText und Symbole", () => {
    expect(pauseText(45)).toBe("0:45");
    expect(pauseText(75)).toBe("1:15");
    expect(pauseText(0)).toBe("–");
    expect(Object.keys(ZEIT_ART_EMOJI)).toHaveLength(ZEIT_ARTEN.length);
  });
});
