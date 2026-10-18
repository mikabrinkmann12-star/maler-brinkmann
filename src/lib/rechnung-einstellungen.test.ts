import { describe, expect, it } from "vitest";
import {
  STANDARD_RECHNUNGSEINSTELLUNGEN,
  eingabeAusEinstellungen,
  einstellungenAusEingabe,
  mahnungsHinweis,
  rechnungsEinstellungenAlsJson,
  rechnungsEinstellungenAusJson,
  rechnungsEinstellungenSchema,
  stufeSchluessel,
} from "./rechnung-einstellungen";

describe("rechnungsEinstellungenAusJson", () => {
  it("ohne Eintrag gelten die Startwerte (kein Zahlungsziel)", () => {
    expect(rechnungsEinstellungenAusJson(undefined)).toEqual(STANDARD_RECHNUNGSEINSTELLUNGEN);
    expect(rechnungsEinstellungenAusJson("Unsinn")).toEqual(STANDARD_RECHNUNGSEINSTELLUNGEN);
  });

  it("liest gespeicherte Werte und verwirft kaputte", () => {
    const e = rechnungsEinstellungenAusJson({
      zahlungsziel_tage: 14,
      skonto_prozent: 2,
      skonto_tage: 7,
      mahnung1: { tage: 10, zinsen_prozent: 5, gebuehr: 5.5 },
      mahnung2: { tage: 9999, zinsen_prozent: "x", gebuehr: -1 },
    });
    expect(e.zahlungszielTage).toBe(14);
    expect(e.skontoProzent).toBe(2);
    expect(e.mahnung1).toEqual({ tage: 10, zinsenProzent: 5, gebuehr: 5.5 });
    expect(e.mahnung2).toEqual(STANDARD_RECHNUNGSEINSTELLUNGEN.mahnung2);
  });

  it("Skonto gilt nur mit Prozent und Frist zusammen", () => {
    const e = rechnungsEinstellungenAusJson({ zahlungsziel_tage: 14, skonto_prozent: 2 });
    expect(e.skontoProzent).toBeNull();
    expect(e.skontoTage).toBeNull();
  });

  it("Hin- und Rückweg ergibt dasselbe", () => {
    const e = { ...STANDARD_RECHNUNGSEINSTELLUNGEN, zahlungszielTage: 7 };
    expect(rechnungsEinstellungenAusJson(rechnungsEinstellungenAlsJson(e))).toEqual(e);
  });
});

describe("rechnungsEinstellungenSchema", () => {
  const gut = eingabeAusEinstellungen({ ...STANDARD_RECHNUNGSEINSTELLUNGEN, zahlungszielTage: 14, skontoProzent: 2, skontoTage: 7 });

  it("nimmt die Startwerte als Eingabe an (Hin- und Rückweg)", () => {
    const r = rechnungsEinstellungenSchema.safeParse(eingabeAusEinstellungen(STANDARD_RECHNUNGSEINSTELLUNGEN));
    expect(r.success).toBe(true);
    if (r.success) expect(einstellungenAusEingabe(r.data)).toEqual(STANDARD_RECHNUNGSEINSTELLUNGEN);
  });

  it("nimmt Komma-Zahlen", () => {
    const r = rechnungsEinstellungenSchema.safeParse({ ...gut, mahnung1: { tage: "7", zinsenProzent: "9,5", gebuehr: "12,50" } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mahnung1).toEqual({ tage: 7, zinsenProzent: 9.5, gebuehr: 12.5 });
  });

  it("lehnt Skonto ohne Frist, ohne Zahlungsziel und mit zu langer Frist ab", () => {
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, skontoTage: "" }).success).toBe(false);
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, zahlungszielTage: "" }).success).toBe(false);
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, skontoTage: "14" }).success).toBe(false);
  });

  it("lehnt Unsinn ab", () => {
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, zahlungszielTage: "abc" }).success).toBe(false);
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, zahlungszielTage: "400" }).success).toBe(false);
    expect(rechnungsEinstellungenSchema.safeParse({ ...gut, erinnerung: { tage: "7", zinsenProzent: "0", gebuehr: "-3" } }).success).toBe(false);
  });
});

describe("Mahnung", () => {
  it("Stufen-Schlüssel", () => {
    expect(stufeSchluessel(0)).toBeNull();
    expect(stufeSchluessel(1)).toBe("erinnerung");
    expect(stufeSchluessel(3)).toBe("mahnung2");
  });
  it("Hinweistext", () => {
    expect(mahnungsHinweis(STANDARD_RECHNUNGSEINSTELLUNGEN, 2)).toBe("1. Mahnung: Frist 7 Tage, Gebühr 3,00 €, Verzugszinsen 0 %");
    expect(mahnungsHinweis(STANDARD_RECHNUNGSEINSTELLUNGEN, 0)).toBeNull();
  });
});
