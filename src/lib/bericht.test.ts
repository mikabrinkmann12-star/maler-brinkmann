import { describe, expect, it } from "vitest";
import { BERICHT_ARTEN, BERICHT_DEFS } from "./bericht-arten";
import {
  abschnittAusgefuellt, berichtAbschliessenSchema, berichtSpeichernSchema, datenLesen, datenPruefen, eintragsZeile,
  istGezeichnet, leereDaten, unterschriftPfad, verweise, wetterText, zahlText,
} from "./bericht";

const P = "0b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const B = "1b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const U = "2b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";

describe("Berichtsarten", () => {
  it("alle neun Arten sind beschrieben, jede beginnt mit „Allgemeine Informationen“ und hat eindeutige Feld-Schlüssel", () => {
    expect(BERICHT_ARTEN).toHaveLength(9);
    for (const art of BERICHT_ARTEN) {
      const def = BERICHT_DEFS[art];
      expect(def.abschnitte[0].id).toBe("allgemein");
      const schluessel = def.abschnitte.flatMap((a) => a.felder.map((f) => f.schluessel));
      expect(new Set(schluessel).size).toBe(schluessel.length);
      expect(new Set(def.abschnitte.map((a) => a.id)).size).toBe(def.abschnitte.length);
    }
  });

  it("Abschnitte wie in Plancraft", () => {
    const titel = (a: (typeof BERICHT_ARTEN)[number]) => BERICHT_DEFS[a].abschnitte.map((x) => x.titel);
    expect(titel("regiebericht")).toEqual(["Allgemeine Informationen", "Mitarbeiter", "Material", "Materialien", "Weitere Anmerkungen", "Bilder"]);
    expect(titel("abnahmeprotokoll")).toEqual(["Allgemeine Informationen", "Abgenommene Leistungen", "Erfasste Mängel", "Weitere Anmerkungen", "Bilder"]);
    expect(titel("checkliste")).toEqual(["Allgemeine Informationen", "Checkliste", "Weitere Anmerkungen"]);
    expect(titel("bedenkenanzeige")).toEqual(["Allgemeine Informationen", "Textfeld", "Bedenkenanzeige gegen", "Gründe für die Bedenken", "Frist"]);
  });
});

describe("leereDaten", () => {
  it("Frist der Bedenkenanzeige ist vorbelegt, „Erstellt von“ ist ich", () => {
    const d = leereDaten("bedenkenanzeige", U);
    expect(String(d.werte.frist)).toContain("5 Werktagen");
    expect(d.allgemein.erstelltVon).toBe(U);
    expect(leereDaten("checkliste").werte.checkliste).toEqual([]);
  });
});

describe("berichtSpeichernSchema", () => {
  const basis = { id: B, projektId: P, art: "bautagesbericht", datum: "2026-10-17", daten: {} };
  it("nimmt bekannte Arten und prüft Datum", () => {
    expect(berichtSpeichernSchema.safeParse(basis).success).toBe(true);
    expect(berichtSpeichernSchema.safeParse({ ...basis, art: "regiebericht" }).success).toBe(true);
    expect(berichtSpeichernSchema.safeParse({ ...basis, art: "irgendwas" }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, datum: "17.10.2026" }).success).toBe(false);
  });
});

describe("datenPruefen", () => {
  it("bereinigt Text, lässt unbekannte Felder fallen und füllt Leerwerte", () => {
    const r = datenPruefen("bautagesbericht", { allgemein: { wetter: "regen", temperatur: 7 }, werte: { leistungen: " Decke gestrichen ", unsinn: 5 } });
    expect(r).toMatchObject({ daten: { allgemein: { wetter: "regen", temperatur: 7 }, werte: { leistungen: "Decke gestrichen", material: "", bilder: [], mitarbeiter: [] } } });
    expect((r as { daten: { werte: object } }).daten.werte).not.toHaveProperty("unsinn");
  });

  it("Wetter gibt es nur bei Arten mit Wetter (sonst wird es verworfen)", () => {
    const r = datenPruefen("checkliste", { allgemein: { wetter: "regen", von: "2026-10-01" } });
    expect(r).toMatchObject({ daten: { allgemein: { wetter: null, von: "" } } });
  });

  it("Listen: leere Einträge fallen weg, Zahlen werden geprüft", () => {
    const ok = datenPruefen("regiebericht", { werte: { mitarbeiter: [{ person: U, stunden: 7.5, leistung: " Streichen " }, { person: "", stunden: null, leistung: "" }] } });
    expect(ok).toMatchObject({ daten: { werte: { mitarbeiter: [{ person: U, stunden: 7.5, leistung: "Streichen" }] } } });
    expect(datenPruefen("regiebericht", { werte: { mitarbeiter: [{ person: U, stunden: -1 }] } })).toHaveProperty("fehler");
    expect(datenPruefen("regiebericht", { werte: { mitarbeiter: [{ person: "kein-uuid" }] } })).toHaveProperty("fehler");
  });

  it("Auswahl und Checkliste nur mit erlaubten Werten", () => {
    expect(datenPruefen("bedenkenanzeige", { werte: { gegen: "ufo" } })).toHaveProperty("fehler");
    expect(datenPruefen("bedenkenanzeige", { werte: { gegen: "material" } })).toMatchObject({ daten: { werte: { gegen: "material" } } });
    const c = datenPruefen("checkliste", { werte: { checkliste: ["aufmass", "ufo", "anforderung"] } });
    expect(c).toMatchObject({ daten: { werte: { checkliste: ["anforderung", "aufmass"] } } });
  });

  it("Fotos: höchstens 8, nur gültige IDs", () => {
    const neun = Array.from({ length: 9 }, (_, i) => `0b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e${String(i).padStart(2, "0")}`);
    expect(datenPruefen("einsatzbericht", { werte: { bilder: neun } })).toHaveProperty("fehler");
    expect(datenPruefen("einsatzbericht", { werte: { bilder: ["x"] } })).toHaveProperty("fehler");
    expect(datenPruefen("einsatzbericht", { werte: { bilder: [U, U] } })).toMatchObject({ daten: { werte: { bilder: [U] } } });
  });

  it("Zeitraum: Ende nicht vor Beginn; Temperatur ganze Zahl", () => {
    expect(datenPruefen("regiebericht", { allgemein: { von: "2026-10-10", bis: "2026-10-01" } })).toHaveProperty("fehler");
    expect(datenPruefen("bautagesbericht", { allgemein: { temperatur: 12.5 } })).toHaveProperty("fehler");
    expect(datenPruefen("bautagesbericht", { allgemein: { temperatur: 99 } })).toHaveProperty("fehler");
  });

  it("zu langer Text wird abgelehnt", () => {
    expect(datenPruefen("bautagesbericht", { werte: { leistungen: "x".repeat(4001) } })).toHaveProperty("fehler");
  });
});

describe("datenLesen", () => {
  it("übersteht kaputte Daten", () => {
    expect(datenLesen("bautagesbericht", null).werte.leistungen).toBe("");
    const d = datenLesen("bautagesbericht", { allgemein: { wetter: "ufo", temperatur: 3 }, werte: { leistungen: "ok", bilder: "kaputt" } });
    expect(d.allgemein.wetter).toBeNull();
    expect(d.werte).toMatchObject({ leistungen: "ok", bilder: [] });
  });

  it("alte Bautagesberichte (arbeiten, personal …) werden übernommen", () => {
    const d = datenLesen("bautagesbericht", { wetter: "regen", temperatur: 9, personal: [U], arbeiten: "Wände", besonderheiten: "Nichts", fotos: [U] });
    expect(d.allgemein).toMatchObject({ wetter: "regen", temperatur: 9 });
    expect(d.werte).toMatchObject({ leistungen: "Wände", vorkommnisse: "Nichts", bilder: [U], mitarbeiter: [{ person: U }] });
  });
});

describe("verweise und abschnittAusgefuellt", () => {
  it("sammelt Personen und Fotos", () => {
    const d = leereDaten("bautagesbericht", U);
    d.werte.mitarbeiter = [{ person: B, bereich: "", anzahl: null, stunden: 8 }];
    d.werte.bilder = [P];
    expect(verweise("bautagesbericht", d)).toEqual({ personen: [U, B], fotos: [P] });
  });

  it("Häkchen in der Abschnittsliste", () => {
    const d = leereDaten("abnahmeprotokoll");
    const [, leistungen, maengel] = BERICHT_DEFS.abnahmeprotokoll.abschnitte;
    expect(abschnittAusgefuellt("abnahmeprotokoll", leistungen, d)).toBe(false);
    d.werte.leistungen = "Alles ok";
    expect(abschnittAusgefuellt("abnahmeprotokoll", leistungen, d)).toBe(true);
    expect(abschnittAusgefuellt("abnahmeprotokoll", maengel, d)).toBe(false);
    d.werte.maengel = [{ mangel: "Kratzer", bis: "" }];
    expect(abschnittAusgefuellt("abnahmeprotokoll", maengel, d)).toBe(true);
  });
});

describe("eintragsZeile", () => {
  it("formatiert einen Eintrag", () => {
    const liste = BERICHT_DEFS.bautagesbericht.abschnitte[1].felder[0];
    if (liste.art !== "liste") throw new Error("Liste erwartet");
    const z = eintragsZeile(liste, { person: U, bereich: "facharbeiter", anzahl: 2, stunden: 7.5 }, () => "Max Muster", (i) => i);
    expect(z.titel).toBe("Max Muster");
    expect(z.zusatz).toEqual(["Facharbeiter · Mitarbeiteranzahl: 2 · 7,5 h"]);
  });
});

describe("berichtAbschliessenSchema", () => {
  it("Unterschrift ist optional, mit Unterschrift braucht sie einen Namen", () => {
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P }).success).toBe(true);
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P, unterschrift: { name: " Herr Müller " } }).data?.unterschrift?.name).toBe("Herr Müller");
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P, unterschrift: { name: "  " } }).success).toBe(false);
  });
});

describe("Hilfen", () => {
  it("unterschriftPfad", () => expect(unterschriftPfad(P, B)).toBe(`${P}/${B}.png`));
  it("wetterText", () => {
    expect(wetterText("sonnig", 14)).toBe("Sonnig, 14 °C");
    expect(wetterText(null, -2)).toBe("-2 °C");
    expect(wetterText(null, null)).toBe("");
  });
  it("zahlText", () => {
    expect(zahlText(8)).toBe("8");
    expect(zahlText(7.5)).toBe("7,5");
    expect(zahlText(null)).toBe("");
  });
  it("istGezeichnet erkennt leere Zeichenflächen", () => {
    expect(istGezeichnet(new Uint8Array(1000))).toBe(false);
    const a = new Uint8Array(1000);
    for (let i = 0; i < 20; i++) a[i] = 255;
    expect(istGezeichnet(a)).toBe(true);
    expect(istGezeichnet([])).toBe(false);
  });
});
