import { describe, expect, it } from "vitest";
import { anfangsbuchstabe, nachBuchstabenGruppieren, sortierName } from "./kontakt-gruppen";

describe("kontakt-gruppen", () => {
  it("sortiert Firmen und Personen zusammen", () => {
    expect(sortierName({ firmenname: "Bäckerei Ahl" })).toBe("Bäckerei Ahl");
    expect(sortierName({ vorname: "Anna", nachname: "Ahrens" })).toBe("Ahrens Anna");
  });
  it("Umlaute und Ziffern", () => {
    expect(anfangsbuchstabe("Äpfel")).toBe("A");
    expect(anfangsbuchstabe("3M")).toBe("#");
  });
  it("gruppiert nach Buchstaben, # zuletzt", () => {
    const g = nachBuchstabenGruppieren([
      { firmenname: "3M" },
      { vorname: "Bert", nachname: "Bauer" },
      { vorname: "Anna", nachname: "Ahrens" },
      { firmenname: "Ahl GmbH" },
    ]);
    expect(g.map((x) => x.buchstabe)).toEqual(["A", "B", "#"]);
    expect(g[0].kontakte).toHaveLength(2);
  });
});
