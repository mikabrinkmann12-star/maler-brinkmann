import { describe, expect, it } from "vitest";
import { KUNDENNUMMER_BEISPIEL, naechsteKundennummer } from "./kundennummer";

describe("naechsteKundennummer", () => {
  it("zählt die höchste laufende Nummer über alle Schreibweisen weiter, ohne Jahr", () => {
    const bestehend = ["KD-241149", "KD-241350", "KD231160", "20-1407-KD", "KD19-1269", "00021", null, ""];
    expect(naechsteKundennummer(bestehend)).toBe("KD-241351");
    expect(naechsteKundennummer(["KD-241400"])).toBe("KD-241401");
  });

  it("ohne passende Nummern beginnt es bei der nächsten Nummer aus Plancraft", () => {
    expect(naechsteKundennummer([])).toBe(KUNDENNUMMER_BEISPIEL);
    expect(naechsteKundennummer(["12-3456-KD", "00021", "D-1001"])).toBe("KD-241351");
  });

  it("niedrigere Nummern ziehen den Zähler nicht zurück", () => {
    expect(naechsteKundennummer(["KD-100000"])).toBe("KD-241351");
  });

  it("ist unabhängig von Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(naechsteKundennummer([" kd-250000 "])).toBe("KD-250001");
  });

  it("wächst über 999999 hinaus, ohne abzuschneiden", () => {
    expect(naechsteKundennummer(["KD-999999"])).toBe("KD-1000000");
  });
});
