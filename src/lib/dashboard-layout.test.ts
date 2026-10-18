import { describe, expect, it } from "vitest";
import { STANDARD_LAYOUT, dialogListe, layoutLesen, layoutSchreiben, verschieben } from "./dashboard-layout";

describe("layoutLesen", () => {
  it("ohne oder mit kaputtem Cookie gilt der Standard", () => {
    expect(layoutLesen(undefined)).toEqual(STANDARD_LAYOUT);
    expect(layoutLesen("kaputt{")).toEqual(STANDARD_LAYOUT);
    expect(layoutLesen(encodeURIComponent("42"))).toEqual(STANDARD_LAYOUT);
  });
  it("gespeicherte Wahl kommt unverändert zurück", () => {
    const l = { links: ["forderungen", "zuletzt"], rechts: ["aufgaben"] } as const;
    expect(layoutLesen(layoutSchreiben({ links: [...l.links], rechts: [...l.rechts] }))).toEqual(l);
  });
  it("leere Spalte bleibt leer (alles ausgeblendet ist erlaubt)", () => {
    expect(layoutLesen(layoutSchreiben({ links: [], rechts: ["wetter"] }))).toEqual({ links: [], rechts: ["wetter"] });
  });
  it("verwirft unbekannte, doppelte und falsch einsortierte Einträge", () => {
    const roh = encodeURIComponent(JSON.stringify({ links: ["zuletzt", "zuletzt", "gibt-es-nicht", "wetter"], rechts: "kein-array" }));
    expect(layoutLesen(roh)).toEqual({ links: ["zuletzt"], rechts: STANDARD_LAYOUT.rechts });
  });
});

describe("verschieben und dialogListe", () => {
  it("schiebt um eine Stelle, am Rand passiert nichts", () => {
    expect(verschieben(["a", "b", "c"], 1, "hoch")).toEqual(["b", "a", "c"]);
    expect(verschieben(["a", "b", "c"], 1, "runter")).toEqual(["a", "c", "b"]);
    expect(verschieben(["a", "b", "c"], 0, "hoch")).toEqual(["a", "b", "c"]);
    expect(verschieben(["a", "b", "c"], 2, "runter")).toEqual(["a", "b", "c"]);
  });
  it("Dialogliste: erst sichtbare in ihrer Reihenfolge, dann ausgeblendete", () => {
    const liste = dialogListe("rechts", ["aufgaben", "wetter"]);
    expect(liste.map((x) => x.id)).toEqual(["aufgaben", "wetter", "hinweise", "material"]);
    expect(liste.map((x) => x.an)).toEqual([true, true, false, false]);
  });
});
