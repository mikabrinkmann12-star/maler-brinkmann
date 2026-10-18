import { describe, expect, it } from "vitest";
import { PROJEKT_PRAEFIX, PROJEKT_START_STANDARD, laufendeNummer, naechsteProjektnummer } from "./projektnummer";

describe("laufendeNummer", () => {
  it("liest die laufende Nummer aus Projektnummer oder reiner Zahl", () => {
    expect(laufendeNummer("P-(2400)447")).toBe(447);
    expect(laufendeNummer(" p-(2600)012 ")).toBe(12);
    expect(laufendeNummer("512")).toBe(512);
    expect(laufendeNummer("D-2026-001")).toBeNull();
    expect(laufendeNummer("")).toBeNull();
    expect(laufendeNummer(null)).toBeNull();
  });
});

describe("naechsteProjektnummer", () => {
  it("zählt ab der höchsten Nummer weiter, mit dem festen Kopf P-(2400)", () => {
    expect(naechsteProjektnummer(["P-(2400)447", "P-(2400)460"], 0)).toBe("P-(2400)461");
    expect(naechsteProjektnummer(["P-(2600)470"], 0)).toBe("P-(2400)471"); // andere Köpfe zählen mit
  });

  it("der Startwert aus Plancraft gilt, wenn er höher ist als alles in der App", () => {
    expect(naechsteProjektnummer([], 602)).toBe("P-(2400)603");
    expect(naechsteProjektnummer(["P-(2400)603"], 602)).toBe("P-(2400)604");
  });

  it("ohne alles beginnt es bei 1 und ignoriert fremde Formate (Demo-Nummern)", () => {
    expect(naechsteProjektnummer([], 0)).toBe("P-(2400)001");
    expect(naechsteProjektnummer(["D-2026-007", "TEST-1"], 0)).toBe("P-(2400)001");
  });

  it("wächst über 999 hinaus", () => {
    expect(naechsteProjektnummer(["P-(2400)999"], 0)).toBe("P-(2400)1000");
  });

  it("die Standardwerte passen zu Plancraft (nächste Nummer 603)", () => {
    expect(PROJEKT_PRAEFIX).toBe("P-(2400)");
    expect(naechsteProjektnummer([], PROJEKT_START_STANDARD)).toBe("P-(2400)603");
  });
});
