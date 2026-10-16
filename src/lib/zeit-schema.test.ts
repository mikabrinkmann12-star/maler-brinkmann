import { describe, expect, it } from "vitest";
import { einstellungenSchema, neueZeitSchema, stundenEingabeLesen, zeitDatenSchema, zeitZeile } from "./zeit-schema";

const PROJEKT = "11111111-1111-4111-8111-111111111111";
const basis = {
  datum: "2026-10-16",
  projektId: PROJEKT,
  art: "arbeitszeit",
  modus: "uhrzeit",
  von: "06:30",
  bis: "15:45",
  pauseMin: 45,
} as const;

describe("zeitDatenSchema", () => {
  it("nimmt einen normalen Arbeitstag an und rechnet 8,5 Std", () => {
    const d = zeitDatenSchema.parse(basis);
    expect(zeitZeile(d)).toEqual({
      datum: "2026-10-16",
      project_id: PROJEKT,
      art: "arbeitszeit",
      von: "06:30",
      bis: "15:45",
      pause_min: 45,
      stunden: 8.5,
      beschreibung: null,
    });
  });

  it("Arbeitszeit ohne Baustelle geht nicht, Schlechtwetter schon", () => {
    expect(zeitDatenSchema.safeParse({ ...basis, projektId: null }).success).toBe(false);
    expect(zeitDatenSchema.safeParse({ ...basis, projektId: null, art: "schlechtwetter" }).success).toBe(true);
  });

  it("meldet Ende vor Beginn verständlich", () => {
    const r = zeitDatenSchema.safeParse({ ...basis, von: "16:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Das Ende muss nach dem Beginn liegen.");
  });

  it("nur Stunden: ohne Uhrzeit und Pause gespeichert", () => {
    const d = zeitDatenSchema.parse({ ...basis, art: "krank", projektId: null, modus: "stunden", stunden: 8, von: "", bis: "" });
    expect(zeitZeile(d)).toMatchObject({ von: null, bis: null, pause_min: 0, stunden: 8 });
    expect(zeitDatenSchema.safeParse({ ...basis, modus: "stunden", stunden: 0 }).success).toBe(false);
  });

  it("lehnt unbekannte Arten und ungültige Daten ab", () => {
    expect(zeitDatenSchema.safeParse({ ...basis, art: "feiern" }).success).toBe(false);
    expect(zeitDatenSchema.safeParse({ ...basis, datum: "2026-02-30" }).success).toBe(false);
  });
});

describe("neueZeitSchema", () => {
  it("braucht mindestens eine Person mit eigener Eintrags-ID", () => {
    expect(neueZeitSchema.safeParse({ daten: basis, personen: [] }).success).toBe(false);
    expect(
      neueZeitSchema.safeParse({ daten: basis, personen: [{ eintragId: PROJEKT, userId: PROJEKT }] }).success,
    ).toBe(true);
  });
});

describe("einstellungenSchema", () => {
  const gueltig = {
    erlaubteArten: ["sonstiges", "arbeitszeit"],
    standardBeginn: "06:30",
    standardEnde: "15:45",
    standardPauseMin: "45",
    kulanzTage: "3",
  };

  it("liest das Formular und sortiert die Arten", () => {
    expect(einstellungenSchema.parse(gueltig)).toEqual({
      erlaubteArten: ["arbeitszeit", "sonstiges"],
      standardBeginn: "06:30",
      standardEnde: "15:45",
      standardPauseMin: 45,
      kulanzTage: 3,
    });
  });

  it("verlangt mindestens eine Art, gültige Zeiten und sinnvolle Grenzen", () => {
    expect(einstellungenSchema.safeParse({ ...gueltig, erlaubteArten: [] }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...gueltig, standardEnde: "06:00" }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...gueltig, kulanzTage: "40" }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...gueltig, standardPauseMin: "-5" }).success).toBe(false);
  });
});

describe("stundenEingabeLesen", () => {
  it("versteht Komma, Punkt und Std:Min", () => {
    expect(stundenEingabeLesen("8,5")).toBe(8.5);
    expect(stundenEingabeLesen("8.25")).toBe(8.25);
    expect(stundenEingabeLesen("8:30")).toBe(8.5);
    expect(stundenEingabeLesen("8")).toBe(8);
    expect(stundenEingabeLesen("8 Std")).toBe(8);
    expect(stundenEingabeLesen("acht")).toBeNull();
    expect(stundenEingabeLesen("")).toBeNull();
  });
});
