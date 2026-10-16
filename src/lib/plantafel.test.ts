import { describe, expect, it } from "vitest";
import {
  kartenVonPerson,
  personVerschieben,
  stoppHinzufuegen,
  terminUebernehmen,
  type Karten,
} from "./plantafel";

const leer = (vehicleId: string | null) => ({ assignmentId: null, vehicleId, stopps: [], mitarbeiterIds: [], notiz: "" });
const start = (): Karten => ({ a: { ...leer("a"), mitarbeiterIds: ["seb"] }, b: leer("b"), ohne: leer(null) });

describe("personVerschieben", () => {
  it("verschiebt von Karte zu Karte", () => {
    const k = personVerschieben(start(), "seb", "a", "b");
    expect(k.a.mitarbeiterIds).toEqual([]);
    expect(k.b.mitarbeiterIds).toEqual(["seb"]);
  });

  it("aus der Leiste hinzufügen lässt andere Karten unberührt (Doppelt-Hinweis in der Anzeige)", () => {
    const k = personVerschieben(start(), "seb", null, "b");
    expect(kartenVonPerson(k).get("seb")).toEqual(["a", "b"]);
  });

  it("nach = null nimmt die Person heraus, doppeltes Ablegen fügt nicht doppelt ein", () => {
    expect(personVerschieben(start(), "seb", "a", null).a.mitarbeiterIds).toEqual([]);
    const doppelt = personVerschieben(personVerschieben(start(), "jan", null, "b"), "jan", null, "b");
    expect(doppelt.b.mitarbeiterIds).toEqual(["jan"]);
  });

  it("verändert den Ausgangszustand nicht", () => {
    const s = start();
    personVerschieben(s, "seb", "a", "b");
    expect(s.a.mitarbeiterIds).toEqual(["seb"]);
  });
});

describe("stoppHinzufuegen und terminUebernehmen", () => {
  it("fügt Baustellen nur einmal hinzu", () => {
    const k = stoppHinzufuegen(stoppHinzufuegen(start(), "a", "garrel"), "a", "garrel");
    expect(k.a.stopps).toEqual([{ projectId: "garrel", zeit: null, zeitArt: null, notiz: "" }]);
  });

  it("übernimmt Personen und Baustelle eines Termins", () => {
    const k = terminUebernehmen(start(), "b", { id: "t", titel: "von Garrel", projectId: "garrel", personIds: ["seb", "jan"] });
    expect(k.b.mitarbeiterIds).toEqual(["seb", "jan"]);
    expect(k.b.stopps.map((s) => s.projectId)).toEqual(["garrel"]);
  });

  it("Termin ohne Baustelle bringt nur die Personen mit", () => {
    const k = terminUebernehmen(start(), "ohne", { id: "t", titel: "Arzt", projectId: null, personIds: ["jan"] });
    expect(k.ohne.stopps).toEqual([]);
    expect(k.ohne.mitarbeiterIds).toEqual(["jan"]);
  });
});
