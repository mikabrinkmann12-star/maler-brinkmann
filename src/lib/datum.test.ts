import { describe, expect, it } from "vitest";
import { heuteIso, istIsoDatum, tageVerschieben } from "./datum";

describe("heuteIso", () => {
  it("nimmt das deutsche Datum, nicht UTC", () => {
    // 23:30 UTC am 14.10. ist in Deutschland schon der 15.10.
    expect(heuteIso(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
    expect(heuteIso(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });
});

describe("tageVerschieben", () => {
  it("verschiebt über Monats-, Jahres- und Zeitumstellungsgrenzen", () => {
    expect(tageVerschieben("2026-10-31", 1)).toBe("2026-11-01");
    expect(tageVerschieben("2026-01-01", -1)).toBe("2025-12-31");
    expect(tageVerschieben("2026-10-25", 1)).toBe("2026-10-26"); // Winterzeit
    expect(tageVerschieben("2028-02-28", 1)).toBe("2028-02-29"); // Schaltjahr
  });
});

describe("istIsoDatum", () => {
  it("erkennt gültige und ungültige Daten", () => {
    expect(istIsoDatum("2026-10-15")).toBe(true);
    expect(istIsoDatum("2026-02-30")).toBe(false);
    expect(istIsoDatum("15.10.2026")).toBe(false);
    expect(istIsoDatum(undefined)).toBe(false);
  });
});
