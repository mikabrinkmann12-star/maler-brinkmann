import { describe, expect, it } from "vitest";
import {
  csvStunden,
  csvText,
  eintraegeFiltern,
  eintraegeSortieren,
  einzelCsv,
  filterLesen,
  gesamtSumme,
  summenCsv,
  summenJePerson,
  vorkommendeArten,
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
