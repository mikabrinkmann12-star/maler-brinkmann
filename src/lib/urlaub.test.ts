import { describe, expect, it } from "vitest";
import { ruecknahmePlan, urlaubskonto, werktage } from "./urlaub";

describe("werktage", () => {
  it("zählt Montag bis Freitag, beide Tage eingeschlossen", () => {
    expect(werktage("2026-10-19", "2026-10-23")).toBe(5); // Mo–Fr
    expect(werktage("2026-10-19", "2026-10-25")).toBe(5); // Mo–So
    expect(werktage("2026-10-17", "2026-10-18")).toBe(0); // Sa–So
    expect(werktage("2026-10-16", "2026-10-16")).toBe(1); // ein Freitag
  });

  it("Feiertage in Niedersachsen zählen nicht", () => {
    expect(werktage("2026-10-26", "2026-10-30")).toBe(5);
    expect(werktage("2026-12-21", "2026-12-25")).toBe(4); // 25.12. ist Feiertag
    expect(werktage("2026-04-02", "2026-04-07")).toBe(2); // Do, (Karfreitag), (Sa/So), (Ostermontag), Di
    expect(werktage("2026-10-31", "2026-10-31")).toBe(0); // Reformationstag (Samstag)
    expect(werktage("2026-05-14", "2026-05-14")).toBe(0); // Christi Himmelfahrt
  });

  it("über Monats- und Jahreswechsel, Ende vor Beginn = 0", () => {
    expect(werktage("2026-12-28", "2027-01-08")).toBe(9); // 1. Januar ist ein Feiertag
    expect(werktage("2026-10-23", "2026-10-19")).toBe(0);
  });
});

describe("urlaubskonto", () => {
  const antraege = [
    { von: "2026-11-09", bis: "2026-11-13", art: "urlaub", status: "genehmigt" as const }, // 5
    { von: "2026-12-28", bis: "2027-01-08", art: "urlaub", status: "genehmigt" as const }, // 4 in 2026, 5 in 2027 (1. Januar ist Feiertag)
    { von: "2026-10-19", bis: "2026-10-20", art: "urlaub", status: "offen" as const }, // 2 beantragt
    { von: "2026-10-21", bis: "2026-10-21", art: "unbezahlter_urlaub", status: "genehmigt" as const }, // zählt nicht
    { von: "2026-10-22", bis: "2026-10-23", art: "urlaub", status: "abgelehnt" as const }, // zählt nicht
  ];

  it("zählt genehmigte Werktage im Jahr, offene extra, unbezahlt und abgelehnt nicht", () => {
    expect(urlaubskonto(28, antraege, 2026)).toEqual({ jahr: 2026, anspruch: 28, genehmigt: 9, beantragt: 2, rest: 19 });
  });

  it("teilt Urlaub über den Jahreswechsel auf", () => {
    expect(urlaubskonto(30, antraege, 2027)).toMatchObject({ genehmigt: 5, rest: 25 });
  });

  it("ohne eingetragenen Anspruch gibt es keinen Rest", () => {
    expect(urlaubskonto(null, antraege, 2026).rest).toBeNull();
  });
});

describe("ruecknahmePlan", () => {
  it("ganz nimmt immer den ganzen Antrag zurück", () => {
    expect(ruecknahmePlan({ von: "2026-10-19", bis: "2026-10-23" }, "2026-10-21", "ganz")).toEqual({ art: "ganz" });
  });
  it("Rest ab heute kürzt einen laufenden Antrag auf gestern", () => {
    expect(ruecknahmePlan({ von: "2026-10-19", bis: "2026-10-23" }, "2026-10-21", "rest")).toEqual({ art: "rest", neuesBis: "2026-10-20" });
    expect(ruecknahmePlan({ von: "2026-09-28", bis: "2026-10-02" }, "2026-10-01", "rest")).toEqual({ art: "rest", neuesBis: "2026-09-30" });
  });
  it("beginnt der Antrag heute oder später, ist Rest gleich ganz", () => {
    expect(ruecknahmePlan({ von: "2026-10-21", bis: "2026-10-23" }, "2026-10-21", "rest")).toEqual({ art: "ganz" });
    expect(ruecknahmePlan({ von: "2026-11-02", bis: "2026-11-06" }, "2026-10-21", "rest")).toEqual({ art: "ganz" });
  });
  it("Vergangenes lässt sich nicht zurücknehmen", () => {
    expect(ruecknahmePlan({ von: "2026-10-05", bis: "2026-10-09" }, "2026-10-21", "ganz")).toHaveProperty("fehler");
  });
  it("Monatswechsel: gestern ist der letzte Tag des Vormonats", () => {
    expect(ruecknahmePlan({ von: "2026-10-28", bis: "2026-11-03" }, "2026-11-01", "rest")).toEqual({ art: "rest", neuesBis: "2026-10-31" });
  });
});
