import { describe, expect, it } from "vitest";
import {
  mitarbeiterZelle,
  projektZelle,
  projekteImZeitraum,
  tageListe,
  wochenAnfang,
  type KalDaten,
} from "./kalender";

const daten: KalDaten = {
  einsaetze: [
    { datum: "2026-10-19", fahrzeug: "Sprinter 1", projekte: [{ id: "g", name: "Gerdes" }, { id: "k", name: "Kramer" }], mitarbeiterIds: ["seb", "jan"] },
    { datum: "2026-10-20", fahrzeug: "Caddy", projekte: [{ id: "g", name: "Gerdes" }], mitarbeiterIds: ["jan"] },
  ],
  termine: [{ datum: "2026-10-20", titel: "von Garrel", projectId: "g", personIds: ["seb"] }],
  abwesenheiten: [
    { userId: "seb", von: "2026-10-21", bis: "2026-10-23", art: "urlaub", status: "genehmigt" },
    { userId: "jan", von: "2026-10-21", bis: "2026-10-21", art: "urlaub", status: "offen" },
  ],
  krank: [{ userId: "seb", datum: "2026-10-22" }],
};

describe("tageListe und wochenAnfang", () => {
  it("listet Tage über Monatsgrenzen und findet den Montag", () => {
    expect(tageListe("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(wochenAnfang("2026-10-16")).toBe("2026-10-12"); // Freitag → Montag
    expect(wochenAnfang("2026-10-18")).toBe("2026-10-12"); // Sonntag → Montag davor
    expect(wochenAnfang("2026-10-19")).toBe("2026-10-19");
  });
});

describe("mitarbeiterZelle", () => {
  it("zeigt Einsatz mit allen Baustellen des Autos", () => {
    expect(mitarbeiterZelle("seb", "2026-10-19", daten).einsaetze).toEqual([
      { fahrzeug: "Sprinter 1", projekte: [{ id: "g", name: "Gerdes" }, { id: "k", name: "Kramer" }] },
    ]);
  });

  it("zeigt Termine, Urlaub (offen markiert) und Krank vor Urlaub", () => {
    expect(mitarbeiterZelle("seb", "2026-10-20", daten).termine).toEqual(["von Garrel"]);
    expect(mitarbeiterZelle("seb", "2026-10-21", daten).abwesend).toEqual({ text: "Urlaub", offen: false });
    expect(mitarbeiterZelle("jan", "2026-10-21", daten).abwesend).toEqual({ text: "Urlaub", offen: true });
    expect(mitarbeiterZelle("seb", "2026-10-22", daten).abwesend).toEqual({ text: "Krank", offen: false });
    expect(mitarbeiterZelle("seb", "2026-10-24", daten).abwesend).toBeNull();
  });
});

describe("projektZelle und projekteImZeitraum", () => {
  it("zeigt Autos, Personen und Termine einer Baustelle", () => {
    expect(projektZelle("g", "2026-10-20", daten)).toEqual({ autos: ["Caddy"], personIds: ["jan"], termine: ["von Garrel"] });
    expect(projektZelle("k", "2026-10-19", daten).personIds).toEqual(["seb", "jan"]);
    expect(projektZelle("k", "2026-10-20", daten)).toEqual({ autos: [], personIds: [], termine: [] });
  });

  it("listet nur vorkommende Projekte, alphabetisch", () => {
    const namen = new Map([["g", "Gerdes"], ["k", "Kramer"]]);
    expect(projekteImZeitraum(daten, namen).map((p) => p.name)).toEqual(["Gerdes", "Kramer"]);
  });
});
