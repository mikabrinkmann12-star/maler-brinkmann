import { describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN } from "./zeiten";
import {
  abbauPruefen,
  kontoBerechnen,
  periodenBilanz,
  saldoLesen,
  sollAufloesen,
  sollSumme,
  standardSoll,
  tagesBilanz,
  tagesSoll,
  wochentag,
  type KontoEintrag,
  type SollWoche,
} from "./ueberstunden";

const STANDARD: SollWoche = [8.5, 8.5, 8.5, 8.5, 6];
const TEILZEIT: SollWoche = [4.67, 4.67, 4.67, 4.67, 3.25]; // ca. 22 Std

// Oktober 2026: Do 1., Fr 2., Sa 3. (Feiertag + Samstag), Mo 5. … Fr 9., Mo 12. … Fr 16., Sa 31.
function e(datum: string, art: KontoEintrag["art"], stunden: number): KontoEintrag {
  return { datum, art, stunden };
}

describe("wochentag", () => {
  it("0 = Montag … 6 = Sonntag", () => {
    expect(wochentag("2026-10-05")).toBe(0);
    expect(wochentag("2026-10-09")).toBe(4);
    expect(wochentag("2026-10-10")).toBe(5);
    expect(wochentag("2026-10-11")).toBe(6);
  });
});

describe("saldoLesen", () => {
  it("liest Zahlen mit Komma, Punkt, Doppelpunkt und Vorzeichen", () => {
    expect(saldoLesen("12,5")).toBe(12.5);
    expect(saldoLesen("12.5")).toBe(12.5);
    expect(saldoLesen("+2")).toBe(2);
    expect(saldoLesen("-3:30")).toBe(-3.5);
    expect(saldoLesen("−1,25 Std")).toBe(-1.25);
    expect(saldoLesen("0")).toBe(0);
    expect(saldoLesen("8:20")).toBe(8.33);
  });
  it("Unlesbares ist null", () => {
    for (const t of ["", "abc", "1,2,3", "--1", "5:75", "1.234"]) expect(saldoLesen(t)).toBeNull();
  });
});

describe("standardSoll / sollAufloesen", () => {
  it("Standard aus den Einstellungen: Mo–Do 8:30, Fr 6:00", () => {
    expect(standardSoll(STANDARD_EINSTELLUNGEN)).toEqual(STANDARD);
  });
  it("leere Felder nehmen den Standard, 0 bleibt 0", () => {
    expect(sollAufloesen([4, null, 0, null, null], STANDARD)).toEqual([4, 8.5, 0, 8.5, 6]);
  });
});

describe("tagesSoll", () => {
  it("Werktag nach Wochentag, Freitag kürzer", () => {
    expect(tagesSoll("2026-10-05", STANDARD)).toBe(8.5);
    expect(tagesSoll("2026-10-09", STANDARD)).toBe(6);
  });
  it("Wochenende und Feiertage: 0", () => {
    expect(tagesSoll("2026-10-10", STANDARD)).toBe(0); // Samstag
    expect(tagesSoll("2026-10-03", STANDARD)).toBe(0); // Tag der Deutschen Einheit (Samstag)
    expect(tagesSoll("2026-12-25", STANDARD)).toBe(0); // Freitag, Feiertag
    expect(tagesSoll("2026-05-14", STANDARD)).toBe(0); // Christi Himmelfahrt (Donnerstag)
  });
});

describe("tagesBilanz", () => {
  it("normaler Tag ohne Abweichung", () => {
    expect(tagesBilanz(8.5, [{ art: "arbeitszeit", stunden: 8.5 }])).toEqual({ soll: 8.5, ist: 8.5, differenz: 0 });
  });
  it("Mehrarbeit ist Plus, zu wenig ist Minus", () => {
    expect(tagesBilanz(8.5, [{ art: "arbeitszeit", stunden: 10 }]).differenz).toBe(1.5);
    expect(tagesBilanz(8.5, [{ art: "arbeitszeit", stunden: 7 }]).differenz).toBe(-1.5);
  });
  it("Arbeit + Fahrt + Schlechtwetter + Sonstiges zählen zusammen", () => {
    const b = tagesBilanz(8.5, [
      { art: "arbeitszeit", stunden: 6 },
      { art: "fahrtzeit", stunden: 1 },
      { art: "schlechtwetter", stunden: 1 },
      { art: "sonstiges", stunden: 0.5 },
    ]);
    expect(b.differenz).toBe(0);
  });
  it("Tag ohne Eintrag: volles Soll als Minus", () => {
    expect(tagesBilanz(8.5, [])).toEqual({ soll: 8.5, ist: 0, differenz: -8.5 });
  });
  it("Urlaub/Krank erfüllen das Soll, auch wenn die Buchung mehr Stunden hat als das Teilzeit-Soll", () => {
    expect(tagesBilanz(4.67, [{ art: "urlaub", stunden: 8.5 }]).differenz).toBe(0);
    expect(tagesBilanz(8.5, [{ art: "krank", stunden: 8.5 }]).differenz).toBe(0);
  });
  it("Halber Tag gearbeitet + halber Tag krank: kein Minus", () => {
    expect(tagesBilanz(8.5, [{ art: "arbeitszeit", stunden: 4 }, { art: "krank", stunden: 4.5 }]).differenz).toBe(0);
  });
  it("Urlaub und mehr gearbeitet als Soll: Mehrstunden bleiben Plus", () => {
    expect(tagesBilanz(8.5, [{ art: "urlaub", stunden: 8.5 }, { art: "arbeitszeit", stunden: 10 }]).differenz).toBe(1.5);
  });
  it("Überstundenabbau (Abfeiern) zählt nicht als gearbeitet: Das Soll bleibt, das Konto sinkt", () => {
    expect(tagesBilanz(8.5, [{ art: "ueberstundenabbau", stunden: 8.5 }])).toEqual({ soll: 8.5, ist: 0, differenz: -8.5 });
    // Mit Teilzeit-Soll: gebuchte Stunden sind egal, es zählt das Soll des Tages
    expect(tagesBilanz(4.67, [{ art: "ueberstundenabbau", stunden: 8.5 }]).differenz).toBe(-4.67);
    // Auf einem Feiertag (Soll 0) ändert Abfeiern nichts
    expect(tagesBilanz(0, [{ art: "ueberstundenabbau", stunden: 8.5 }]).differenz).toBe(0);
  });
  it("Bildung zählt wie Arbeitszeit, Feiertag erfüllt das Soll wie Urlaub", () => {
    expect(tagesBilanz(8.5, [{ art: "bildung", stunden: 8.5 }])).toEqual({ soll: 8.5, ist: 8.5, differenz: 0 });
    expect(tagesBilanz(8.5, [{ art: "bildung", stunden: 10 }]).differenz).toBe(1.5);
    expect(tagesBilanz(8.5, [{ art: "feiertag", stunden: 8.5 }]).differenz).toBe(0);
    // Feiertag ersetzt das Soll wie Urlaub: Wer zusätzlich weniger als das Soll arbeitet, bekommt kein Plus, mehr als das Soll bleibt Plus
    expect(tagesBilanz(8.5, [{ art: "feiertag", stunden: 8.5 }, { art: "arbeitszeit", stunden: 2 }]).differenz).toBe(0);
    expect(tagesBilanz(8.5, [{ art: "feiertag", stunden: 8.5 }, { art: "arbeitszeit", stunden: 10 }]).differenz).toBe(1.5);
    expect(tagesBilanz(4.67, [{ art: "feiertag", stunden: 8.5 }]).differenz).toBe(0);
  });
  it("Unbezahlter Urlaub und Kurzarbeit nehmen das Soll weg", () => {
    expect(tagesBilanz(8.5, [{ art: "unbezahlter_urlaub", stunden: 8.5 }])).toEqual({ soll: 0, ist: 0, differenz: 0 });
    expect(tagesBilanz(8.5, [{ art: "kurzarbeit", stunden: 8.5 }]).differenz).toBe(0);
  });
});

describe("periodenBilanz", () => {
  it("eine volle Woche ohne Abweichung (Mo 5. – So 11.)", () => {
    const woche = [
      e("2026-10-05", "arbeitszeit", 8.5), e("2026-10-06", "arbeitszeit", 8.5), e("2026-10-07", "arbeitszeit", 8.5),
      e("2026-10-08", "arbeitszeit", 8.5), e("2026-10-09", "arbeitszeit", 6),
    ];
    expect(periodenBilanz("2026-10-05", "2026-10-11", STANDARD, woche)).toEqual({ soll: 40, ist: 40, differenz: 0 });
  });
  it("Eintrag am Wochenende ist Plus (Soll 0)", () => {
    expect(periodenBilanz("2026-10-10", "2026-10-11", STANDARD, [e("2026-10-10", "arbeitszeit", 5)]).differenz).toBe(5);
  });
  it("Einträge außerhalb des Zeitraums zählen nicht", () => {
    expect(periodenBilanz("2026-10-05", "2026-10-05", STANDARD, [e("2026-10-06", "arbeitszeit", 8.5)]).ist).toBe(0);
  });
  it("Teilzeit 22 Std: volle Woche = 0 Differenz", () => {
    const woche = [e("2026-10-05", "arbeitszeit", 4.67), e("2026-10-06", "arbeitszeit", 4.67), e("2026-10-07", "arbeitszeit", 4.67), e("2026-10-08", "arbeitszeit", 4.67), e("2026-10-09", "arbeitszeit", 3.25)];
    const b = periodenBilanz("2026-10-05", "2026-10-11", TEILZEIT, woche);
    expect(b.differenz).toBe(0);
    expect(b.soll).toBe(21.93);
  });
  it("Teilzeit an festen Tagen (Mo–Mi je 7:20, sonst 0): Do/Fr ohne Eintrag ist kein Minus", () => {
    const festeTage: SollWoche = [7.33, 7.33, 7.33, 0, 0];
    const woche = [e("2026-10-05", "arbeitszeit", 7.33), e("2026-10-06", "arbeitszeit", 7.33), e("2026-10-07", "arbeitszeit", 7.33)];
    expect(periodenBilanz("2026-10-05", "2026-10-11", festeTage, woche).differenz).toBe(0);
  });
  it("Feiertag ohne Eintrag ist kein Minus (Neujahr 2026 = Donnerstag)", () => {
    expect(periodenBilanz("2026-01-01", "2026-01-01", STANDARD, []).differenz).toBe(0);
  });
  it("ab nach bis: alles 0", () => {
    expect(periodenBilanz("2026-10-10", "2026-10-09", STANDARD, [])).toEqual({ soll: 0, ist: 0, differenz: 0 });
  });
  it("rechnet ohne Fließkomma-Reste", () => {
    const b = periodenBilanz("2026-10-05", "2026-10-06", [0.1, 0.2, 0, 0, 0], [e("2026-10-05", "arbeitszeit", 0.1), e("2026-10-06", "arbeitszeit", 0.2)]);
    expect(b).toEqual({ soll: 0.3, ist: 0.3, differenz: 0 });
  });
});

describe("kontoBerechnen", () => {
  const basis = { anfangssaldo: 0, soll: STANDARD, eintraege: [] as KontoEintrag[] };

  it("ohne „Konto ab“ gibt es kein Konto", () => {
    expect(kontoBerechnen({ ...basis, kontoAb: null, heute: "2026-10-16" }, "2026-10")).toBeNull();
  });

  it("Stand = Anfangssaldo + Differenzen bis gestern (heute zählt noch nicht)", () => {
    const eintraege = [e("2026-10-05", "arbeitszeit", 10), e("2026-10-06", "arbeitszeit", 8.5)];
    const r = kontoBerechnen({ ...basis, anfangssaldo: 12.5, eintraege, kontoAb: "2026-10-05", heute: "2026-10-07" }, "2026-10");
    expect(r?.stand).toBe(14); // 12,5 + 1,5 + 0 (Di 6.) – Mi 7. ist heute
    expect(r?.monat).toEqual({ soll: 17, ist: 18.5, differenz: 1.5 });
  });

  it("heute zählt nicht: Erster Tag des Kontos = heute → Stand ist der Anfangssaldo", () => {
    const r = kontoBerechnen({ ...basis, anfangssaldo: -3, kontoAb: "2026-10-16", heute: "2026-10-16" }, "2026-10");
    expect(r?.stand).toBe(-3);
    expect(r?.monat.soll).toBe(0);
  });

  it("Tage vor „Konto ab“ werden ignoriert, auch Einträge davor", () => {
    const eintraege = [e("2026-10-01", "arbeitszeit", 20)];
    const r = kontoBerechnen({ ...basis, eintraege, kontoAb: "2026-10-05", heute: "2026-10-06" }, "2026-10");
    expect(r?.stand).toBe(-8.5); // nur Mo 5. ohne Eintrag
  });

  it("Monat vor dem Stichtag: Bilanz 0, Monat nach dem Stichtag: volle Bilanz", () => {
    const eingabe = { ...basis, kontoAb: "2026-10-05", heute: "2026-11-20" };
    expect(kontoBerechnen(eingabe, "2026-09")?.monat).toEqual({ soll: 0, ist: 0, differenz: 0 });
    // Oktober ab dem 5.: 5.–9. (40) + 12.–16. (40) + 19.–23. (40) + 26.–30. (40) – 31.10. ist Samstag und Reformationstag
    expect(kontoBerechnen(eingabe, "2026-10")?.monat.soll).toBe(160);
  });

  it("zukünftiger Monat: Bilanz 0", () => {
    expect(kontoBerechnen({ ...basis, kontoAb: "2026-10-05", heute: "2026-10-16" }, "2026-12")?.monat.soll).toBe(0);
  });
});

describe("sollSumme / abbauPruefen", () => {
  it("sollSumme zählt Soll-Tage ohne Wochenende und Feiertage", () => {
    expect(sollSumme("2026-10-05", "2026-10-11", STANDARD)).toBe(40);
    expect(sollSumme("2026-10-30", "2026-11-02", STANDARD)).toBe(14.5); // Fr 6 + Mo 8,5; 31.10. ist Samstag
    expect(sollSumme("2026-12-24", "2026-12-28", STANDARD)).toBe(17); // Do 8,5 + Mo 8,5; 25./26.12. Feiertage
  });

  const basis = { soll: STANDARD, heute: "2026-10-16", vorgemerkt: [] as { von: string; bis: string }[] };

  it("reicht: Stand 20 Std, Antrag für 2 Tage (17 Std)", () => {
    const r = abbauPruefen({ ...basis, stand: 20, neu: { von: "2026-10-19", bis: "2026-10-20" } });
    expect(r).toEqual({ ok: true, benoetigt: 17, reserviert: 0, nachher: 3 });
  });

  it("reicht genau (nachher 0) ist erlaubt, ein Rest-Minus nicht", () => {
    expect(abbauPruefen({ ...basis, stand: 8.5, neu: { von: "2026-10-19", bis: "2026-10-19" } }).ok).toBe(true);
    expect(abbauPruefen({ ...basis, stand: 8.49, neu: { von: "2026-10-19", bis: "2026-10-19" } }).ok).toBe(false);
  });

  it("negatives Konto: kein Abfeiern", () => {
    expect(abbauPruefen({ ...basis, stand: -1, neu: { von: "2026-10-19", bis: "2026-10-19" } }).ok).toBe(false);
  });

  it("andere offene oder genehmigte Anträge ab heute sind vorgemerkt", () => {
    const r = abbauPruefen({
      ...basis, stand: 20,
      vorgemerkt: [{ von: "2026-10-26", bis: "2026-10-26" }],
      neu: { von: "2026-10-19", bis: "2026-10-20" },
    });
    expect(r).toMatchObject({ reserviert: 8.5, benoetigt: 17, nachher: -5.5, ok: false });
  });

  it("Tage vor heute zählen nicht noch einmal (stecken schon im Stand)", () => {
    const r = abbauPruefen({ ...basis, stand: 5, neu: { von: "2026-10-12", bis: "2026-10-16" } });
    expect(r.benoetigt).toBe(6); // nur Freitag 16.10. (heute)
    expect(r.ok).toBe(false);
    expect(abbauPruefen({ ...basis, stand: 5, neu: { von: "2026-10-12", bis: "2026-10-15" } })).toMatchObject({ benoetigt: 0, ok: true });
  });

  it("Feiertage und Wochenenden brauchen keine Stunden", () => {
    expect(abbauPruefen({ ...basis, stand: 0, neu: { von: "2026-10-31", bis: "2026-11-01" } }).ok).toBe(true);
  });
});
