import { describe, expect, it } from "vitest";
import { urlaubskonto, werktage } from "./urlaub";

describe("werktage", () => {
  it("zählt Montag bis Freitag, beide Tage eingeschlossen", () => {
    expect(werktage("2026-10-19", "2026-10-23")).toBe(5); // Mo–Fr
    expect(werktage("2026-10-19", "2026-10-25")).toBe(5); // Mo–So
    expect(werktage("2026-10-17", "2026-10-18")).toBe(0); // Sa–So
    expect(werktage("2026-10-16", "2026-10-16")).toBe(1); // ein Freitag
  });

  it("über Monats- und Jahreswechsel, Ende vor Beginn = 0", () => {
    expect(werktage("2026-12-28", "2027-01-08")).toBe(10);
    expect(werktage("2026-10-23", "2026-10-19")).toBe(0);
  });
});

describe("urlaubskonto", () => {
  const antraege = [
    { von: "2026-11-09", bis: "2026-11-13", art: "urlaub", status: "genehmigt" as const }, // 5
    { von: "2026-12-28", bis: "2027-01-08", art: "urlaub", status: "genehmigt" as const }, // 4 in 2026, 6 in 2027
    { von: "2026-10-19", bis: "2026-10-20", art: "urlaub", status: "offen" as const }, // 2 beantragt
    { von: "2026-10-21", bis: "2026-10-21", art: "unbezahlter_urlaub", status: "genehmigt" as const }, // zählt nicht
    { von: "2026-10-22", bis: "2026-10-23", art: "urlaub", status: "abgelehnt" as const }, // zählt nicht
  ];

  it("zählt genehmigte Werktage im Jahr, offene extra, unbezahlt und abgelehnt nicht", () => {
    expect(urlaubskonto(28, antraege, 2026)).toEqual({ jahr: 2026, anspruch: 28, genehmigt: 9, beantragt: 2, rest: 19 });
  });

  it("teilt Urlaub über den Jahreswechsel auf", () => {
    expect(urlaubskonto(30, antraege, 2027)).toMatchObject({ genehmigt: 6, rest: 24 });
  });

  it("ohne eingetragenen Anspruch gibt es keinen Rest", () => {
    expect(urlaubskonto(null, antraege, 2026).rest).toBeNull();
  });
});
