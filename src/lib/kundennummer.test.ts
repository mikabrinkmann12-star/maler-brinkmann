import { describe, expect, it } from "vitest";
import { naechsteKundennummer } from "./kundennummer";

describe("naechsteKundennummer", () => {
  it("zählt die höchste laufende Nummer über alle Jahre und Schreibweisen weiter", () => {
    const bestehend = ["KD-241149", "KD-241350", "KD231160", "20-1407-KD", "KD19-1269", "00021", null, ""];
    expect(naechsteKundennummer(bestehend, 2026)).toBe("KD-261351");
  });

  it("nimmt das aktuelle Jahr, auch wenn die höchste Nummer aus einem älteren Jahr stammt", () => {
    expect(naechsteKundennummer(["KD-241350"], 2027)).toBe("KD-271351");
  });

  it("ohne passende Nummern beginnt es bei 1", () => {
    expect(naechsteKundennummer([], 2026)).toBe("KD-260001");
    expect(naechsteKundennummer(["12-3456-KD", "00021"], 2026)).toBe("KD-260001");
  });

  it("ist unabhängig von Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(naechsteKundennummer([" kd-261400 "], 2026)).toBe("KD-261401");
  });

  it("wächst über 9999 hinaus, ohne abzuschneiden", () => {
    expect(naechsteKundennummer(["KD-269999"], 2026)).toBe("KD-2610000");
  });
});
