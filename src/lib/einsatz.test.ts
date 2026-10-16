import { describe, expect, it } from "vitest";
import { stoppVerschieben, stoppZeitText, stoppsSortieren } from "./einsatz";

describe("stoppZeitText", () => {
  it("beschreibt die Zeit verständlich, ohne Zeit leer", () => {
    expect(stoppZeitText("10:00:00", "um")).toBe("um 10:00 Uhr da sein");
    expect(stoppZeitText("12:30", "ab")).toBe("ab 12:30 Uhr");
    expect(stoppZeitText(null, null)).toBe("");
    expect(stoppZeitText("10:00", null)).toBe("");
  });
});

describe("stoppsSortieren", () => {
  it("behält die Reihenfolge des Büros, Zeiten ändern sie nicht", () => {
    const stopps = [
      { id: "c", zeit: null, sortierung: 2 },
      { id: "a", zeit: "13:00", sortierung: 0 },
      { id: "b", zeit: null, sortierung: 1 },
    ];
    expect(stoppsSortieren(stopps).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("verändert die Eingabe nicht", () => {
    const eingabe = [{ sortierung: 2 }, { sortierung: 1 }];
    stoppsSortieren(eingabe);
    expect(eingabe[0].sortierung).toBe(2);
  });
});

describe("stoppVerschieben", () => {
  it("tauscht mit dem Nachbarn, an den Rändern passiert nichts", () => {
    expect(stoppVerschieben(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(stoppVerschieben(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(stoppVerschieben(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(stoppVerschieben(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
