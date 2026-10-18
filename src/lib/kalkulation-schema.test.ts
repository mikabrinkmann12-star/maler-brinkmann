import { describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN, einstellungenAusJson, kalkulationAusJson } from "./kalkulation";
import { kalkulationEingabeSchema, kalkulationEinstellungenSchema } from "./kalkulation-schema";

describe("kalkulationEingabeSchema", () => {
  it("liest deutsche Zahlen, leer gilt als 0", () => {
    const r = kalkulationEingabeSchema.parse({ lohngruppeId: "standard", lohnMinuten: "7,5", material: "3,20", geraete: "", fremdleistung: "1.234,50", sonstiges: "0" });
    expect(r).toEqual({ lohngruppeId: "standard", lohnMinuten: 7.5, material: 3.2, geraete: 0, fremdleistung: 1234.5, sonstiges: 0 });
  });
  it("lehnt Unsinn und Zu-Großes ab", () => {
    expect(kalkulationEingabeSchema.safeParse({ lohnMinuten: "abc" }).success).toBe(false);
    expect(kalkulationEingabeSchema.safeParse({ material: "-1" }).success).toBe(false);
    expect(kalkulationEingabeSchema.safeParse({ lohnMinuten: "100001" }).success).toBe(false);
    expect(kalkulationEingabeSchema.safeParse({ material: "1000001" }).success).toBe(false);
  });
});

describe("kalkulationEinstellungenSchema", () => {
  const gruppe = { id: "", name: "Gesellen", lohnkosten: "24,88", verrechnungssatz: "47,50" };
  const ok = { material: "40", geraete: "5", fremdleistung: "0", sonstiges: "3", lohngruppen: [gruppe] };
  it("gültige Einstellungen", () => {
    const r = kalkulationEinstellungenSchema.parse(ok);
    expect(r.material).toBe(40);
    expect(r.lohngruppen[0]).toMatchObject({ name: "Gesellen", lohnkosten: 24.88, verrechnungssatz: 47.5 });
  });
  it("Verrechnungssatz unter den Lohnkosten, doppelte Namen, keine Lohngruppe, Zuschlag zu hoch", () => {
    expect(kalkulationEinstellungenSchema.safeParse({ ...ok, lohngruppen: [{ ...gruppe, verrechnungssatz: "20" }] }).success).toBe(false);
    expect(kalkulationEinstellungenSchema.safeParse({ ...ok, lohngruppen: [gruppe, { ...gruppe, name: "gesellen" }] }).success).toBe(false);
    expect(kalkulationEinstellungenSchema.safeParse({ ...ok, lohngruppen: [] }).success).toBe(false);
    expect(kalkulationEinstellungenSchema.safeParse({ ...ok, material: "1000" }).success).toBe(false);
    expect(kalkulationEinstellungenSchema.safeParse({ ...ok, lohngruppen: [{ ...gruppe, name: " " }] }).success).toBe(false);
  });
});

describe("gespeicherte JSON-Werte lesen", () => {
  it("Einstellungen: Fehlendes und Kaputtes fällt auf die Startwerte zurück", () => {
    expect(einstellungenAusJson(null, null)).toEqual(STANDARD_EINSTELLUNGEN);
    expect(einstellungenAusJson({ material: 45 }, [{ id: "a", name: "Meister", lohnkosten: 30, verrechnungssatz: "55" }, { name: "ohne id" }, 7])).toEqual({
      zuschlaege: { material: 45, geraete: 5, fremdleistung: 0, sonstiges: 3 },
      lohngruppen: [{ id: "a", name: "Meister", lohnkosten: 30, verrechnungssatz: 55 }],
    });
  });
  it("Zusammensetzung einer Leistung", () => {
    expect(kalkulationAusJson(null)).toBeNull();
    expect(kalkulationAusJson("text")).toBeNull();
    expect(kalkulationAusJson({ lohngruppeId: "standard", lohnMinuten: 12, material: "3.2" })).toEqual({ lohngruppeId: "standard", lohnMinuten: 12, material: 3.2, geraete: 0, fremdleistung: 0, sonstiges: 0 });
  });
});
