import { describe, expect, it } from "vitest";
import { arbeitszeitSchema } from "./arbeitszeit-schema";

const leer = { sollMo: "", sollDi: "", sollMi: "", sollDo: "", sollFr: "", kontoAb: "", anfangssaldo: "" };

describe("arbeitszeitSchema", () => {
  it("alles leer: Standard-Soll, kein Konto", () => {
    expect(arbeitszeitSchema.parse(leer)).toEqual({ soll: [null, null, null, null, null], kontoAb: null, anfangssaldo: 0 });
  });

  it("Teilzeit: einzelne Tage, 0 ist ein echter Wert, leer ist Standard", () => {
    const r = arbeitszeitSchema.parse({ ...leer, sollMo: "7:20", sollDi: "7,33", sollMi: "0", kontoAb: "2026-10-01", anfangssaldo: "-3:30" });
    expect(r.soll).toEqual([7.33, 7.33, 0, null, null]);
    expect(r.kontoAb).toBe("2026-10-01");
    expect(r.anfangssaldo).toBe(-3.5);
  });

  it("lehnt unlesbare oder zu große Soll-Werte mit dem Namen des Tages ab", () => {
    for (const w of ["abc", "13", "-1", "8,555"]) {
      const r = arbeitszeitSchema.safeParse({ ...leer, sollDo: w });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toContain("Donnerstag");
    }
  });

  it("lehnt ungültiges Datum und unlesbaren Saldo ab", () => {
    expect(arbeitszeitSchema.safeParse({ ...leer, kontoAb: "2026-02-30" }).success).toBe(false);
    expect(arbeitszeitSchema.safeParse({ ...leer, kontoAb: "2026-10-01", anfangssaldo: "viel" }).success).toBe(false);
    expect(arbeitszeitSchema.safeParse({ ...leer, kontoAb: "2026-10-01", anfangssaldo: "1000" }).success).toBe(false);
  });

  it("Anfangssaldo ohne „Konto ab“ ist ein Fehler, 0 ohne Datum nicht", () => {
    expect(arbeitszeitSchema.safeParse({ ...leer, anfangssaldo: "5" }).success).toBe(false);
    expect(arbeitszeitSchema.safeParse({ ...leer, anfangssaldo: "0" }).success).toBe(true);
  });
});
