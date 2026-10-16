import { describe, expect, it } from "vitest";
import { laufendeNummer, naechsteProjektnummer } from "./projektnummer";

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
  it("zählt ab der höchsten Nummer weiter, mit dem Jahr in der Klammer", () => {
    expect(naechsteProjektnummer(["P-(2400)447", "P-(2500)460"], 0, 2026)).toBe("P-(2600)461");
  });

  it("der Startwert aus Plancraft gilt, wenn er höher ist als alles in der App", () => {
    expect(naechsteProjektnummer([], 512, 2026)).toBe("P-(2600)513");
    expect(naechsteProjektnummer(["P-(2600)513"], 512, 2026)).toBe("P-(2600)514");
  });

  it("ohne alles beginnt es bei 1 und ignoriert fremde Formate (Demo-Nummern)", () => {
    expect(naechsteProjektnummer([], 0, 2026)).toBe("P-(2600)001");
    expect(naechsteProjektnummer(["D-2026-007", "TEST-1"], 0, 2026)).toBe("P-(2600)001");
  });

  it("wächst über 999 hinaus", () => {
    expect(naechsteProjektnummer(["P-(2600)999"], 0, 2026)).toBe("P-(2600)1000");
  });
});
