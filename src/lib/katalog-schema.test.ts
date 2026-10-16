import { describe, expect, it } from "vitest";
import { leistungSchema, materialSchema, ordnerSchema } from "./katalog-schema";

const ID = "11111111-1111-4111-8111-111111111111";

describe("ordnerSchema", () => {
  it("Name Pflicht, Elternordner leer = oberste Ebene", () => {
    expect(ordnerSchema.parse({ name: " Farben ", parentId: "" })).toEqual({ name: "Farben", parentId: null });
    expect(ordnerSchema.parse({ name: "Lacke", parentId: ID }).parentId).toBe(ID);
    expect(ordnerSchema.safeParse({ name: "  ", parentId: "" }).success).toBe(false);
    expect(ordnerSchema.safeParse({ name: "x", parentId: "kein-uuid" }).success).toBe(false);
    expect(ordnerSchema.safeParse({ name: "x".repeat(101), parentId: "" }).success).toBe(false);
  });
});

describe("materialSchema", () => {
  const basis = { folderId: "", artikelnr: "", name: "Dispersionsfarbe weiß", beschreibung: "", lieferant: "", einheit: "Eimer", ek: "", zuschlag: "" };

  it("liest Preise und Zuschlag aus deutschen Eingaben, leer = 0", () => {
    const r = materialSchema.parse({ ...basis, ek: "1.234,56", zuschlag: "12,5 %" });
    expect(r).toMatchObject({ ek: 1234.56, zuschlag: 12.5, folderId: null });
    expect(materialSchema.parse(basis)).toMatchObject({ ek: 0, zuschlag: 0 });
  });

  it("lehnt fehlende Bezeichnung und Einheit ab", () => {
    expect(materialSchema.safeParse({ ...basis, name: " " }).success).toBe(false);
    expect(materialSchema.safeParse({ ...basis, einheit: "" }).success).toBe(false);
    expect(materialSchema.safeParse({ ...basis, einheit: "x".repeat(21) }).success).toBe(false);
  });

  it("lehnt unlesbare oder zu große Preise und Zuschläge mit verständlicher Meldung ab", () => {
    const ek = materialSchema.safeParse({ ...basis, ek: "teuer" });
    expect(ek.success).toBe(false);
    expect(ek.error?.issues[0].message).toContain("Einkaufspreis");
    expect(materialSchema.safeParse({ ...basis, ek: "1000001" }).success).toBe(false);
    expect(materialSchema.safeParse({ ...basis, ek: "-5" }).success).toBe(false);
    const z = materialSchema.safeParse({ ...basis, zuschlag: "1000" });
    expect(z.success).toBe(false);
    expect(z.error?.issues[0].message).toContain("Zuschlag");
  });
});

describe("leistungSchema", () => {
  it("Kurztext, Einheit, Kosten und Zuschlag", () => {
    const r = leistungSchema.parse({ folderId: ID, nummer: "01.0010", name: "Wände streichen", langtext: "Zweimal streichen", einheit: "m²", kosten: "8,4", zuschlag: "35" });
    expect(r).toMatchObject({ folderId: ID, kosten: 8.4, zuschlag: 35, einheit: "m²" });
    expect(leistungSchema.safeParse({ folderId: "", name: "", einheit: "m²" }).success).toBe(false);
    expect(leistungSchema.safeParse({ folderId: "", name: "x", einheit: "m²", langtext: "x".repeat(5001) }).success).toBe(false);
  });
});
