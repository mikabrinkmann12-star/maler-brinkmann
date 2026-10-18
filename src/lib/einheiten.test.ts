import { describe, expect, it } from "vitest";
import { STANDARD_EINHEITEN, einheitenAusJson, einheitenBereinigen, einheitenPruefen } from "./einheiten";

describe("einheitenBereinigen", () => {
  it("entfernt leere und doppelte Einträge, behält die Reihenfolge", () => {
    expect(einheitenBereinigen([" m² ", "", "Stk", "STK", "m²", "kg"])).toEqual(["m²", "Stk", "kg"]);
  });
});

describe("einheitenAusJson", () => {
  it("fehlend oder kaputt = Standard", () => {
    expect(einheitenAusJson(null)).toEqual(STANDARD_EINHEITEN);
    expect(einheitenAusJson({ liste: "kaputt" })).toEqual(STANDARD_EINHEITEN);
    expect(einheitenAusJson({ liste: [] })).toEqual(STANDARD_EINHEITEN);
  });
  it("gespeicherte Werte kommen zurück, Fehlendes wird ergänzt", () => {
    expect(einheitenAusJson({ liste: ["Stk", "m²", 7], position: "m²" })).toEqual({ liste: ["Stk", "m²"], position: "m²", material: "m²" });
  });
});

describe("einheitenPruefen", () => {
  const ok = { liste: ["Stk", "m²", "Std"], position: "stk", material: "m²" };
  it("gültige Eingabe, Vorauswahl passt sich der Schreibweise der Liste an", () => {
    expect(einheitenPruefen(ok)).toEqual({ wert: { liste: ["Stk", "m²", "Std"], position: "Stk", material: "m²" } });
  });
  it("Fehler", () => {
    expect(einheitenPruefen({ ...ok, liste: [" ", ""] })).toHaveProperty("fehler");
    expect(einheitenPruefen({ ...ok, position: "Eimer" })).toHaveProperty("fehler");
    expect(einheitenPruefen({ ...ok, material: "Eimer" })).toHaveProperty("fehler");
    expect(einheitenPruefen({ ...ok, liste: ["x".repeat(21), "Stk", "m²"] })).toHaveProperty("fehler");
    expect(einheitenPruefen({ ...ok, liste: Array.from({ length: 61 }, (_, i) => `E${i}`), position: "E0", material: "E1" })).toHaveProperty("fehler");
  });
});
