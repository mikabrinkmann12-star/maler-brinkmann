import { describe, expect, it } from "vitest";
import { abgleichFaellig } from "./rechnung-abgleich";

const jetzt = Date.parse("2026-10-21T12:00:00Z");
const vor = (min: number) => new Date(jetzt - min * 60_000).toISOString();
const basis = { status: "uebertragen", lexwareStatus: "open", hatDatei: true, abgeglichenAm: vor(1) };

describe("abgleichFaellig", () => {
  it("gleicht Entwürfe der App nie ab", () => {
    expect(abgleichFaellig({ ...basis, status: "entwurf", abgeglichenAm: null }, jetzt)).toBe(false);
    expect(abgleichFaellig({ ...basis, status: "wird_uebertragen", abgeglichenAm: null }, jetzt)).toBe(false);
  });

  it("holt eine fehlende Datei sofort nach, auch bei frischem Abgleich", () => {
    expect(abgleichFaellig({ ...basis, hatDatei: false }, jetzt)).toBe(true);
    expect(abgleichFaellig({ ...basis, lexwareStatus: "paid", hatDatei: false }, jetzt)).toBe(true);
  });

  it("wartet bei offenen Rechnungen fünf Minuten", () => {
    expect(abgleichFaellig({ ...basis, abgeglichenAm: vor(4) }, jetzt)).toBe(false);
    expect(abgleichFaellig({ ...basis, abgeglichenAm: vor(6) }, jetzt)).toBe(true);
    expect(abgleichFaellig({ ...basis, abgeglichenAm: null }, jetzt)).toBe(true);
  });

  it("gleicht Entwürfe in der Buchhaltung ab (dort wird später finalisiert)", () => {
    expect(abgleichFaellig({ ...basis, lexwareStatus: "draft", hatDatei: false, abgeglichenAm: vor(10) }, jetzt)).toBe(true);
    expect(abgleichFaellig({ ...basis, lexwareStatus: "draft", hatDatei: false, abgeglichenAm: vor(1) }, jetzt)).toBe(false);
  });

  it("lässt bezahlte und stornierte Rechnungen mit Datei in Ruhe", () => {
    expect(abgleichFaellig({ ...basis, lexwareStatus: "paid", abgeglichenAm: vor(500) }, jetzt)).toBe(false);
    expect(abgleichFaellig({ ...basis, lexwareStatus: "voided", hatDatei: false, abgeglichenAm: vor(500) }, jetzt)).toBe(false);
  });
});
