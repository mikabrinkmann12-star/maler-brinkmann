import { describe, expect, it } from "vitest";
import { darstellungPruefen, istAkzent, menueOrdnen, wirksameDarstellung } from "./darstellung";

describe("Darstellung", () => {
  it("prüft Eingaben: unbekannte Farbe und fremde Werte fallen weg", () => {
    expect(darstellungPruefen({ akzent: "pink", reihenfolge: ["/buero/angebote", 3, "javascript:x", "/buero/angebote"], ausgeblendet: "x" })).toEqual({
      akzent: null,
      reihenfolge: ["/buero/angebote"],
      ausgeblendet: null,
      glas: null,
    });
    expect(darstellungPruefen(null)).toEqual({ akzent: null, reihenfolge: null, ausgeblendet: null, glas: null });
    expect(darstellungPruefen({ glas: true }).glas).toBe(true);
    expect(istAkzent("blau")).toBe(true);
  });

  it("eigene Werte vor Firmen-Vorgabe vor App-Standard", () => {
    const firma = { akzent: "petrol" as const, reihenfolge: ["/buero/zeiten"], ausgeblendet: ["/buero/anrufe"], glas: null };
    expect(wirksameDarstellung({ akzent: null, reihenfolge: null, ausgeblendet: null, glas: null }, firma)).toEqual({ akzent: "petrol", reihenfolge: ["/buero/zeiten"], ausgeblendet: ["/buero/anrufe"], glas: false });
    expect(wirksameDarstellung({ akzent: "blau", reihenfolge: null, ausgeblendet: [], glas: true }, firma)).toEqual({ akzent: "blau", reihenfolge: ["/buero/zeiten"], ausgeblendet: [], glas: true });
    expect(wirksameDarstellung({ akzent: null, reihenfolge: null, ausgeblendet: null, glas: null }, { akzent: null, reihenfolge: null, ausgeblendet: null, glas: null })).toMatchObject({ akzent: "gruen", glas: false });
  });

  it("ordnet das Menü, hängt neue Punkte hinten an, blendet aus, Übersicht bleibt immer", () => {
    const alle = ["/buero", "/buero/projekte", "/buero/angebote", "/buero/zeiten"];
    expect(menueOrdnen(alle, ["/buero/zeiten", "/buero/unbekannt", "/buero"], ["/buero/angebote", "/buero"])).toEqual(["/buero/zeiten", "/buero", "/buero/projekte"]);
    expect(menueOrdnen(alle, [], [])).toEqual(alle);
  });
});
