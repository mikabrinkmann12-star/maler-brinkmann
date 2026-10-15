import { describe, expect, it } from "vitest";
import {
  LEER,
  formatBetrag,
  formatDatum,
  formatDatumZeit,
  formatUhrzeit,
  formatZahl,
} from "./format";

// Intl setzt zwischen Betrag und € ein geschütztes Leerzeichen.
const NBSP = " ";

describe("formatDatum", () => {
  it("formatiert Kalenderdaten aus Postgres als TT.MM.JJJJ", () => {
    expect(formatDatum("2026-10-15")).toBe("15.10.2026");
    expect(formatDatum("2026-01-05")).toBe("05.01.2026");
  });

  it("verschiebt reine Kalenderdaten nicht durch Zeitzonen", () => {
    expect(formatDatum("2026-12-31")).toBe("31.12.2026");
    expect(formatDatum("2027-01-01")).toBe("01.01.2027");
  });

  it("zeigt Zeitpunkte im deutschen Datum (Europe/Berlin)", () => {
    // 23:30 UTC am 14.10. ist in Deutschland (Sommerzeit) schon der 15.10.
    expect(formatDatum("2026-10-14T23:30:00Z")).toBe("15.10.2026");
    expect(formatDatum(new Date("2026-03-01T12:00:00Z"))).toBe("01.03.2026");
  });

  it("zeigt einen Strich bei fehlenden oder ungültigen Werten", () => {
    expect(formatDatum(null)).toBe(LEER);
    expect(formatDatum(undefined)).toBe(LEER);
    expect(formatDatum("")).toBe(LEER);
    expect(formatDatum("kein datum")).toBe(LEER);
  });
});

describe("formatDatumZeit / formatUhrzeit", () => {
  it("rechnet in deutsche Zeit um (Sommer- und Winterzeit)", () => {
    expect(formatDatumZeit("2026-07-01T12:30:00Z")).toBe("01.07.2026, 14:30");
    expect(formatDatumZeit("2026-12-01T12:30:00Z")).toBe("01.12.2026, 13:30");
    expect(formatUhrzeit("2026-07-01T05:05:00Z")).toBe("07:05");
  });

  it("zeigt einen Strich bei fehlenden Werten", () => {
    expect(formatDatumZeit(null)).toBe(LEER);
    expect(formatUhrzeit(undefined)).toBe(LEER);
  });
});

describe("formatBetrag", () => {
  it("formatiert Beträge als 1.234,56 €", () => {
    expect(formatBetrag(1234.56)).toBe(`1.234,56${NBSP}€`);
    expect(formatBetrag(0)).toBe(`0,00${NBSP}€`);
    expect(formatBetrag(1000000)).toBe(`1.000.000,00${NBSP}€`);
    expect(formatBetrag(-89.9)).toBe(`-89,90${NBSP}€`);
  });

  it("rundet auf zwei Nachkommastellen", () => {
    // 10,125 ist als Kommazahl exakt darstellbar → kaufmännisch aufgerundet
    expect(formatBetrag(10.125)).toBe(`10,13${NBSP}€`);
    expect(formatBetrag(19.994)).toBe(`19,99${NBSP}€`);
  });

  it("zeigt einen Strich bei fehlenden Werten", () => {
    expect(formatBetrag(null)).toBe(LEER);
    expect(formatBetrag(Number.NaN)).toBe(LEER);
  });
});

describe("formatZahl", () => {
  it("nutzt Komma und Tausenderpunkt", () => {
    expect(formatZahl(12.5)).toBe("12,5");
    expect(formatZahl(1234.5, { min: 2, max: 2 })).toBe("1.234,50");
    expect(formatZahl(3)).toBe("3");
  });
});
