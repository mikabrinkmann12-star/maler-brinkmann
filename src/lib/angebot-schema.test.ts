import { describe, expect, it } from "vitest";
import {
  abschlussSchema,
  auswahlAusSteuer,
  bausteinPruefen,
  kopfSchema,
  neuesAngebotSchema,
  steuerAusAuswahl,
} from "./angebot-schema";

describe("bausteinPruefen", () => {
  it("Position: deutsche Zahlen werden gelesen", () => {
    const r = bausteinPruefen({ typ: "position", kurztext: " Wände streichen ", menge: "313,63", einheit: "m²", einzelpreis: "11,80" });
    expect(r).toEqual({ daten: { typ: "position", kurztext: "Wände streichen", langtext: null, menge: 313.63, einheit: "m²", einzelpreis: 11.8 } });
  });

  it("Position: Pflichtfelder und Zahlenformate", () => {
    expect("fehler" in bausteinPruefen({ typ: "position", menge: "1", einheit: "m", einzelpreis: "1" })).toBe(true); // ohne Text
    expect("fehler" in bausteinPruefen({ typ: "position", kurztext: "x", menge: "abc", einheit: "m", einzelpreis: "1" })).toBe(true);
    expect("fehler" in bausteinPruefen({ typ: "position", kurztext: "x", menge: "1", einheit: "", einzelpreis: "1" })).toBe(true);
    expect("fehler" in bausteinPruefen({ typ: "position", kurztext: "x", menge: "1", einheit: "m", einzelpreis: "1,234" })).toBe(true);
    expect("fehler" in bausteinPruefen({ typ: "position", kurztext: "x", menge: "1", einheit: "m", einzelpreis: "" })).toBe(true);
    expect("fehler" in bausteinPruefen({ typ: "position", kurztext: "x", menge: "2000000", einheit: "m", einzelpreis: "1" })).toBe(true);
  });

  it("Position darf nur einen Langtext haben und negative Werte (Abzug)", () => {
    expect(bausteinPruefen({ typ: "position", langtext: "Nur Langtext", menge: "-1", einheit: "psch", einzelpreis: "-50" })).toEqual({
      daten: { typ: "position", kurztext: null, langtext: "Nur Langtext", menge: -1, einheit: "psch", einzelpreis: -50 },
    });
  });

  it("Titel, Text, Bild, Zwischensumme", () => {
    expect(bausteinPruefen({ typ: "titel", kurztext: "Wohnzimmer" })).toMatchObject({ daten: { typ: "titel", kurztext: "Wohnzimmer" } });
    expect("fehler" in bausteinPruefen({ typ: "titel", kurztext: " " })).toBe(true);
    expect(bausteinPruefen({ typ: "text", langtext: "Hinweis" })).toMatchObject({ daten: { langtext: "Hinweis" } });
    expect("fehler" in bausteinPruefen({ typ: "text" })).toBe(true);
    expect(bausteinPruefen({ typ: "bild", kurztext: "Vorher" })).toMatchObject({ daten: { typ: "bild", kurztext: "Vorher" } });
    expect(bausteinPruefen({ typ: "zwischensumme", kurztext: "ignoriert" })).toEqual({
      daten: { typ: "zwischensumme", kurztext: null, langtext: null, menge: null, einheit: null, einzelpreis: null },
    });
    expect("fehler" in bausteinPruefen({ typ: "unbekannt" })).toBe(true);
  });

  it("zu lange Texte werden abgelehnt", () => {
    expect("fehler" in bausteinPruefen({ typ: "titel", kurztext: "x".repeat(201) })).toBe(true);
    expect("fehler" in bausteinPruefen({ typ: "text", langtext: "x".repeat(5001) })).toBe(true);
  });
});

describe("Kopf, Abschluss, Steuer", () => {
  it("kopfSchema prüft Betreff und Datum", () => {
    const ok = { betreff: "Wohnzimmer", leistungsort: "", datum: "2026-10-17", empfaenger: "", einleitung: "" };
    expect(kopfSchema.safeParse(ok).success).toBe(true);
    expect(kopfSchema.safeParse({ ...ok, betreff: " " }).success).toBe(false);
    expect(kopfSchema.safeParse({ ...ok, datum: "2026-02-30" }).success).toBe(false);
    expect(kopfSchema.safeParse({ ...ok, datum: "17.10.2026" }).success).toBe(false);
  });

  it("neuesAngebotSchema: Betreff ist Pflicht", () => {
    expect(neuesAngebotSchema.safeParse({ betreff: "", leistungsort: "" }).success).toBe(false);
    expect(neuesAngebotSchema.safeParse({ betreff: "A", leistungsort: "" }).success).toBe(true);
  });

  it("abschlussSchema: Rabatt als deutsche Zahl, leer = 0", () => {
    expect(abschlussSchema.parse({ schlusstext: "", steuer: "19", rabatt: "2,5" }).rabatt).toBe(2.5);
    expect(abschlussSchema.parse({ schlusstext: "", steuer: "19", rabatt: "" }).rabatt).toBe(0);
    expect(abschlussSchema.safeParse({ schlusstext: "", steuer: "19", rabatt: "101" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ schlusstext: "", steuer: "19", rabatt: "-1" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ schlusstext: "", steuer: "19", rabatt: "viel" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ schlusstext: "", steuer: "16", rabatt: "0" }).success).toBe(false);
  });

  it("abschlussSchema: Zahlungsziel, Skonto und gültig bis (leer = keine Angabe)", () => {
    const basis = { schlusstext: "", steuer: "19", rabatt: "" };
    expect(abschlussSchema.parse(basis)).toMatchObject({ zahlungsziel: null, skontoProzent: null, skontoTage: null, gueltigBis: null });
    expect(abschlussSchema.parse({ ...basis, zahlungsziel: "14", skontoProzent: "2,5", skontoTage: "7", gueltigBis: "2026-11-17" })).toMatchObject({
      zahlungsziel: 14, skontoProzent: 2.5, skontoTage: 7, gueltigBis: "2026-11-17",
    });
    expect(abschlussSchema.safeParse({ ...basis, zahlungsziel: "-1" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, zahlungsziel: "14,5" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, skontoProzent: "2" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, skontoTage: "7" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, skontoProzent: "25", skontoTage: "7" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, gueltigBis: "17.11.2026" }).success).toBe(false);
    expect(abschlussSchema.safeParse({ ...basis, gueltigBis: "2026-02-30" }).success).toBe(false);
  });

  it("Steuer-Auswahl ↔ Spalten", () => {
    expect(steuerAusAuswahl("19")).toEqual({ steuersatz: 19, reverseCharge: false });
    expect(steuerAusAuswahl("7")).toEqual({ steuersatz: 7, reverseCharge: false });
    expect(steuerAusAuswahl("0")).toEqual({ steuersatz: 0, reverseCharge: false });
    expect(steuerAusAuswahl("rc")).toEqual({ steuersatz: 0, reverseCharge: true });
    expect(auswahlAusSteuer(0, true)).toBe("rc");
    expect(auswahlAusSteuer(0, false)).toBe("0");
    expect(auswahlAusSteuer(7, false)).toBe("7");
    expect(auswahlAusSteuer(19, false)).toBe("19");
  });
});
