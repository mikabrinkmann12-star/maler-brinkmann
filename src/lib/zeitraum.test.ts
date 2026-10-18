import { describe, expect, it } from "vitest";
import { isoKalenderwoche, istTag, monatVerschieben, monatsRaster, vorgabeBereich, vorgabeFuer, wochentag } from "./zeitraum";

// Sonntag, 18.10.2026 (so wie in den Plancraft-Aufnahmen)
const HEUTE = "2026-10-18";

describe("vorgabeBereich", () => {
  it("Tage und Wochen (Montag bis Sonntag)", () => {
    expect(wochentag(HEUTE)).toBe(6);
    expect(vorgabeBereich("heute", HEUTE)).toEqual({ von: HEUTE, bis: HEUTE });
    expect(vorgabeBereich("gestern", HEUTE)).toEqual({ von: "2026-10-17", bis: "2026-10-17" });
    expect(vorgabeBereich("diese_woche", HEUTE)).toEqual({ von: "2026-10-12", bis: "2026-10-18" });
    expect(vorgabeBereich("letzte_woche", HEUTE)).toEqual({ von: "2026-10-05", bis: "2026-10-11" });
    expect(vorgabeBereich("letzte_7_tage", HEUTE)).toEqual({ von: "2026-10-12", bis: HEUTE });
    expect(vorgabeBereich("letzte_30_tage", HEUTE)).toEqual({ von: "2026-09-19", bis: HEUTE });
  });
  it("Monate, Quartale, Jahre", () => {
    expect(vorgabeBereich("dieser_monat", HEUTE)).toEqual({ von: "2026-10-01", bis: "2026-10-31" });
    expect(vorgabeBereich("letzter_monat", HEUTE)).toEqual({ von: "2026-09-01", bis: "2026-09-30" });
    expect(vorgabeBereich("dieses_quartal", HEUTE)).toEqual({ von: "2026-10-01", bis: "2026-12-31" });
    expect(vorgabeBereich("letztes_quartal", HEUTE)).toEqual({ von: "2026-07-01", bis: "2026-09-30" });
    expect(vorgabeBereich("dieses_jahr", HEUTE)).toEqual({ von: "2026-01-01", bis: "2026-12-31" });
    expect(vorgabeBereich("letztes_jahr", HEUTE)).toEqual({ von: "2025-01-01", bis: "2025-12-31" });
  });
  it("Jahreswechsel: letzter Monat im Januar, letztes Quartal im ersten Quartal", () => {
    expect(vorgabeBereich("letzter_monat", "2026-01-15")).toEqual({ von: "2025-12-01", bis: "2025-12-31" });
    expect(vorgabeBereich("letztes_quartal", "2026-02-10")).toEqual({ von: "2025-10-01", bis: "2025-12-31" });
    expect(vorgabeBereich("dieser_monat", "2028-02-10").bis).toBe("2028-02-29");
  });
  it("vorgabeFuer erkennt Vorgaben wieder", () => {
    expect(vorgabeFuer({ von: "2026-10-01", bis: "2026-10-31" }, HEUTE)).toBe("dieser_monat");
    expect(vorgabeFuer({ von: "2026-10-02", bis: "2026-10-31" }, HEUTE)).toBeNull();
  });
});

describe("Kalenderwoche und Monatsraster", () => {
  it("ISO-Kalenderwochen wie im Plancraft-Kalender (KW 40 beginnt am 28.9.2026)", () => {
    expect(isoKalenderwoche("2026-10-01")).toBe(40);
    expect(isoKalenderwoche("2026-10-18")).toBe(42);
    expect(isoKalenderwoche("2026-11-30")).toBe(49);
    expect(isoKalenderwoche("2026-01-01")).toBe(1);
    expect(isoKalenderwoche("2027-01-01")).toBe(53); // Freitag, noch KW 53 von 2026
  });
  it("Oktober 2026: 5 Wochen, KW 40 bis 44, 1. Oktober ist ein Donnerstag", () => {
    const r = monatsRaster(2026, 10);
    expect(r.map((w) => w.kw)).toEqual([40, 41, 42, 43, 44]);
    expect(r[0].tage).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(r[4].tage[0]).toBe("2026-10-26");
    expect(r[4].tage.at(-1)).toBeNull();
  });
  it("monatVerschieben über den Jahreswechsel", () => {
    expect(monatVerschieben(2026, 12, 1)).toEqual({ jahr: 2027, monat: 1 });
    expect(monatVerschieben(2026, 1, -1)).toEqual({ jahr: 2025, monat: 12 });
  });
  it("istTag", () => {
    expect(istTag("2026-10-18")).toBe(true);
    expect(istTag("18.10.2026")).toBe(false);
    expect(istTag(null)).toBe(false);
  });
});
