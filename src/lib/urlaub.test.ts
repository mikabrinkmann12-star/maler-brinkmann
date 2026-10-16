import { describe, expect, it } from "vitest";
import { werktage } from "./urlaub";

describe("werktage", () => {
  it("zählt Montag bis Freitag, beide Tage eingeschlossen", () => {
    expect(werktage("2026-10-19", "2026-10-23")).toBe(5); // Mo–Fr
    expect(werktage("2026-10-19", "2026-10-25")).toBe(5); // Mo–So
    expect(werktage("2026-10-17", "2026-10-18")).toBe(0); // Sa–So
    expect(werktage("2026-10-16", "2026-10-16")).toBe(1); // ein Freitag
  });

  it("über Monats- und Jahreswechsel, Ende vor Beginn = 0", () => {
    expect(werktage("2026-12-28", "2027-01-08")).toBe(10);
    expect(werktage("2026-10-23", "2026-10-19")).toBe(0);
  });
});
