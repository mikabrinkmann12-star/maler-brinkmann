import { describe, expect, it } from "vitest";
import { aufmassAuswahl, aufmassSortiert, einheitFuerPosition } from "./aufmass-auswahl";

describe("einheitFuerPosition", () => {
  it("m2 → m², m → m, stk → Stk", () => {
    expect(einheitFuerPosition("m2")).toBe("m²");
    expect(einheitFuerPosition("m")).toBe("m");
    expect(einheitFuerPosition("stk")).toBe("Stk");
  });
});

describe("aufmassAuswahl", () => {
  it("fasst gleiche Positionen zusammen und nennt die Einheit wie in Positionen", () => {
    const r = aufmassAuswahl([
      { position: "Wände streichen", einheit: "m2", menge: 10.5 },
      { position: "wände streichen ", einheit: "m2", menge: 4.25 },
      { position: "Sockelleisten", einheit: "m", menge: 12 },
      { position: "Türen", einheit: "stk", menge: 3 },
    ]);
    expect(r).toEqual([
      { position: "Sockelleisten", menge: 12, einheit: "m" },
      { position: "Türen", menge: 3, einheit: "Stk" },
      { position: "Wände streichen", menge: 14.75, einheit: "m²" },
    ]);
  });
  it("leeres Aufmaß gibt eine leere Liste", () => {
    expect(aufmassAuswahl([])).toEqual([]);
  });
});

describe("aufmassSortiert", () => {
  const liste = [
    { position: "Decken", menge: 20, einheit: "m²" },
    { position: "Wände streichen", menge: 100, einheit: "m²" },
    { position: "Türen", menge: 3, einheit: "Stk" },
  ];
  it("setzt passende Einträge nach oben, auch bei längerem Positionstext", () => {
    const r = aufmassSortiert(liste, "Wände streichen, zweimal mit Dispersion");
    expect(r[0].eintrag.position).toBe("Wände streichen");
    expect(r[0].passt).toBe(true);
    expect(r.slice(1).map((x) => x.passt)).toEqual([false, false]);
  });
  it("ohne Text bleibt die Reihenfolge", () => {
    expect(aufmassSortiert(liste, "").map((x) => x.eintrag.position)).toEqual(["Decken", "Wände streichen", "Türen"]);
  });
});
