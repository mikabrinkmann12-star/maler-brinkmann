import { describe, expect, it } from "vitest";
import {
  STANDARD_EINSTELLUNGEN,
  arbeitsMinuten,
  einstellungenAlsJson,
  einstellungenLesen,
  fruehesterAenderbarerTag,
  tagesStandard,
  projektVorschlag,
  stundenAusMinuten,
  ueberschneidetSich,
  uhrzeitKurz,
  vorschlagFuerTag,
  zeitNochAenderbar,
} from "./zeiten";

describe("arbeitsMinuten", () => {
  it("6:30–15:45 mit 45 Min Pause = 8,5 Std (wie in der Datenbank)", () => {
    expect(arbeitsMinuten("06:30", "15:45", 45)).toEqual({ minuten: 510 });
    expect(stundenAusMinuten(510)).toBe(8.5);
  });

  it("rundet wie die Datenbank auf 2 Nachkommastellen", () => {
    expect(stundenAusMinuten(440)).toBe(7.33); // 7:20
    expect(stundenAusMinuten(25)).toBe(0.42);
  });

  it("meldet Ende vor Beginn, zu lange Pause und fehlende Uhrzeiten", () => {
    expect(arbeitsMinuten("15:00", "07:00", 0)).toEqual({ fehler: "Das Ende muss nach dem Beginn liegen." });
    expect(arbeitsMinuten("07:00", "07:00", 0)).toEqual({ fehler: "Das Ende muss nach dem Beginn liegen." });
    expect(arbeitsMinuten("07:00", "07:30", 45)).toEqual({ fehler: "Die Pause ist länger als die Arbeitszeit." });
    expect(arbeitsMinuten("", "07:30", 0)).toEqual({ fehler: "Bitte Beginn und Ende eingeben." });
    expect(arbeitsMinuten("25:00", "26:00", 0)).toEqual({ fehler: "Bitte Beginn und Ende eingeben." });
  });
});

describe("uhrzeitKurz", () => {
  it("kürzt Uhrzeiten aus Postgres", () => {
    expect(uhrzeitKurz("06:30:00")).toBe("06:30");
    expect(uhrzeitKurz(null)).toBe("");
  });
});

describe("ueberschneidetSich", () => {
  it("erkennt Überschneidungen, direkter Anschluss ist erlaubt", () => {
    expect(ueberschneidetSich({ von: "06:30", bis: "12:00" }, { von: "11:00", bis: "15:45" })).toBe(true);
    expect(ueberschneidetSich({ von: "06:30", bis: "12:00" }, { von: "12:00", bis: "15:45" })).toBe(false);
    expect(ueberschneidetSich({ von: "08:00", bis: "09:00" }, { von: "06:30", bis: "15:45" })).toBe(true);
  });
});

describe("vorschlagFuerTag", () => {
  const e = STANDARD_EINSTELLUNGEN;

  it("ohne Einträge: Standardzeiten", () => {
    expect(vorschlagFuerTag([], e)).toEqual({ von: "06:30", bis: "15:45", pauseMin: 45 });
  });

  it("zweite Baustelle: Beginn = Ende des letzten Eintrags, keine zweite Pause", () => {
    const vorhandene = [{ von: "06:30:00", bis: "11:00:00", pause_min: 30 }];
    expect(vorschlagFuerTag(vorhandene, e)).toEqual({ von: "11:00", bis: "15:45", pauseMin: 0 });
  });

  it("nach Feierabend ist kein Ende vorgeschlagen", () => {
    const vorhandene = [{ von: "06:30:00", bis: "16:30:00", pause_min: 45 }];
    expect(vorschlagFuerTag(vorhandene, e)).toEqual({ von: "16:30", bis: "", pauseMin: 0 });
  });

  it("Einträge ohne Uhrzeit (nur Stunden) zählen nicht als Ende", () => {
    expect(vorschlagFuerTag([{ von: null, bis: null, pause_min: 0 }], e)).toEqual({ von: "06:30", bis: "15:45", pauseMin: 45 });
  });
});

describe("tagesStandard", () => {
  it("Mo–Do 6:30–15:45 mit 45 Min, freitags 6:30–12:45 mit 15 Min (= 6 Std)", () => {
    expect(tagesStandard("2026-10-15", STANDARD_EINSTELLUNGEN)).toEqual({ standardBeginn: "06:30", standardEnde: "15:45", standardPauseMin: 45 });
    const freitag = tagesStandard("2026-10-16", STANDARD_EINSTELLUNGEN);
    expect(freitag).toEqual({ standardBeginn: "06:30", standardEnde: "12:45", standardPauseMin: 15 });
    expect(arbeitsMinuten(freitag.standardBeginn, freitag.standardEnde, freitag.standardPauseMin)).toEqual({ minuten: 360 });
  });

  it("der Vorschlag am Freitag nutzt die Freitagszeiten", () => {
    expect(vorschlagFuerTag([], tagesStandard("2026-10-16", STANDARD_EINSTELLUNGEN))).toEqual({ von: "06:30", bis: "12:45", pauseMin: 15 });
  });
});

describe("Sperrfrist (wie zeit_noch_aenderbar in der Datenbank)", () => {
  it("frühester Tag: Monatserster, bis zum Kulanztag der Erste des Vormonats", () => {
    expect(fruehesterAenderbarerTag("2026-10-16", 3)).toBe("2026-10-01");
    expect(fruehesterAenderbarerTag("2026-11-03", 3)).toBe("2026-10-01");
    expect(fruehesterAenderbarerTag("2026-11-04", 3)).toBe("2026-11-01");
    expect(fruehesterAenderbarerTag("2027-01-02", 3)).toBe("2026-12-01");
    expect(fruehesterAenderbarerTag("2026-11-01", 0)).toBe("2026-11-01");
  });

  it("laufender Monat ja, Vormonat nur bis zum Kulanztag, Zukunft nie", () => {
    expect(zeitNochAenderbar("2026-10-01", "2026-10-31", 3)).toBe(true);
    expect(zeitNochAenderbar("2026-10-31", "2026-11-03", 3)).toBe(true);
    expect(zeitNochAenderbar("2026-10-31", "2026-11-04", 3)).toBe(false);
    expect(zeitNochAenderbar("2026-09-30", "2026-11-02", 3)).toBe(false);
    expect(zeitNochAenderbar("2026-10-17", "2026-10-16", 3)).toBe(false);
  });
});

describe("einstellungenLesen", () => {
  it("liest den Wert aus der Datenbank und sortiert die Arten", () => {
    const wert = {
      erlaubte_arten: ["sonstiges", "arbeitszeit", "unsinn"],
      standard_beginn: "07:00",
      standard_ende: "16:00",
      standard_pause_min: 30,
      freitag_ende: "13:00",
      freitag_pause_min: 20,
      kulanz_tage: 5,
    };
    expect(einstellungenLesen(wert)).toEqual({
      erlaubteArten: ["arbeitszeit", "sonstiges"],
      standardBeginn: "07:00",
      standardEnde: "16:00",
      standardPauseMin: 30,
      freitagEnde: "13:00",
      freitagPauseMin: 20,
      kulanzTage: 5,
    });
  });

  it("fällt bei fehlenden oder kaputten Werten auf den Standard zurück", () => {
    expect(einstellungenLesen(null)).toEqual(STANDARD_EINSTELLUNGEN);
    expect(einstellungenLesen({ standard_beginn: "7 Uhr", kulanz_tage: -1 })).toEqual(STANDARD_EINSTELLUNGEN);
  });

  it("einstellungenAlsJson ist die Umkehrung", () => {
    expect(einstellungenLesen(einstellungenAlsJson(STANDARD_EINSTELLUNGEN))).toEqual(STANDARD_EINSTELLUNGEN);
  });
});

describe("projektVorschlag", () => {
  const einsaetze = [
    { datum: "2026-10-16", projektId: "gerdes" },
    { datum: "2026-10-16", projektId: "kramer" },
    { datum: "2026-10-15", projektId: "ring" },
  ];
  const meine = ["gerdes", "kramer", "ring"];

  it("nimmt die eingeteilte Baustelle des Tages", () => {
    expect(projektVorschlag("2026-10-15", einsaetze, [], meine)).toBe("ring");
    expect(projektVorschlag("2026-10-16", einsaetze, [], meine)).toBe("gerdes");
  });

  it("bei zwei Einsätzen die, für die noch nichts eingetragen ist", () => {
    const eintraege = [{ datum: "2026-10-16", projektId: "gerdes" }];
    expect(projektVorschlag("2026-10-16", einsaetze, eintraege, meine)).toBe("kramer");
  });

  it("ohne Einsatz: nur wenn es genau eine Baustelle gibt", () => {
    expect(projektVorschlag("2026-10-14", einsaetze, [], meine)).toBe("");
    expect(projektVorschlag("2026-10-14", einsaetze, [], ["ring"])).toBe("ring");
  });

  it("ignoriert Einsätze auf Baustellen, die nicht (mehr) zur Auswahl stehen", () => {
    expect(projektVorschlag("2026-10-15", einsaetze, [], ["gerdes"])).toBe("gerdes");
  });
});
