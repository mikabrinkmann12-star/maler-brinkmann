import { describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN } from "./kalkulation";
import { ergebnisBerechnen, istBerechnen, prozentVonSoll, sollBerechnen } from "./nachkalkulation";

const einst = STANDARD_EINSTELLUNGEN; // Lohnkosten 24,88 €/h

const wand = { lohngruppeId: "standard", lohnMinuten: 12, material: 1.5, geraete: 0.2, fremdleistung: 0, sonstiges: 0.1 };

describe("sollBerechnen", () => {
  it("rechnet Stunden und Kosten aus Menge × Kalkulation", () => {
    const s = sollBerechnen([{ menge: 100, kalkulation: wand }], einst);
    expect(s.stunden).toBe(20); // 100 × 12 Min
    expect(s.kosten.lohn).toBe(497.6); // 20 h × 24,88
    expect(s.kosten.material).toBe(150);
    expect(s.kosten.geraete).toBe(20);
    expect(s.kosten.sonstiges).toBe(10);
    expect(s.kostenGesamt).toBe(677.6);
    expect(s.kalkuliert).toBe(1);
  });

  it("zählt Positionen ohne Kalkulation nur als nicht kalkuliert", () => {
    const s = sollBerechnen([{ menge: 5, kalkulation: null }, { menge: 0, kalkulation: wand }], einst);
    expect(s.stunden).toBe(0);
    expect(s.kostenGesamt).toBe(0);
    expect(s.unkalkuliert).toBe(2);
  });
});

describe("istBerechnen", () => {
  it("zählt nur Arbeitszeiten und bewertet sie mit den Lohnkosten", () => {
    const i = istBerechnen(
      { zeiten: [{ art: "arbeitszeit", stunden: 8.5 }, { art: "fahrtzeit", stunden: 1.5 }, { art: "urlaub", stunden: 8 }], kosten: [], eingangsrechnungen: [] },
      einst,
    );
    expect(i.stunden).toBe(10);
    expect(i.kosten.lohn).toBe(248.8);
    expect(i.lohnkostenProStunde).toBe(24.88);
  });

  it("verteilt erfasste Kosten und Eingangsrechnungen auf die Kostenarten (unbekannt = Material)", () => {
    const i = istBerechnen(
      {
        zeiten: [],
        kosten: [{ kostenart: "geraete", betrag: 120.5 }, { kostenart: "fremdleistung", betrag: 300 }],
        eingangsrechnungen: [{ kostenart: "material", netto: 99.99 }, { kostenart: "komisch", netto: 0.01 }],
      },
      einst,
    );
    expect(i.kosten).toEqual({ lohn: 0, material: 100, geraete: 120.5, fremdleistung: 300, sonstiges: 0 });
    expect(i.kostenGesamt).toBe(520.5);
  });

  it("rechnet ohne Lohngruppe keinen Lohn", () => {
    const i = istBerechnen({ zeiten: [{ art: "arbeitszeit", stunden: 4 }], kosten: [], eingangsrechnungen: [] }, { ...einst, lohngruppen: [] });
    expect(i.kosten.lohn).toBe(0);
    expect(i.lohnkostenProStunde).toBeNull();
  });
});

describe("Vergleich", () => {
  it("rechnet Prozent und Ertrag", () => {
    expect(prozentVonSoll(25, 20)).toBe(125);
    expect(prozentVonSoll(5, 0)).toBeNull();
    const soll = sollBerechnen([{ menge: 100, kalkulation: wand }], einst);
    const ist = istBerechnen({ zeiten: [{ art: "arbeitszeit", stunden: 20 }], kosten: [{ kostenart: "material", betrag: 150 }], eingangsrechnungen: [] }, einst);
    const e = ergebnisBerechnen(1500, soll, ist);
    expect(e.ertrag).toBe(852.4); // 1500 minus (497,60 + 150)
    expect(e.ertragProzent).toBe(56.8);
    expect(e.sollErtrag).toBe(822.4);
  });
});
