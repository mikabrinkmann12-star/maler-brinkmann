import { describe, expect, it } from "vitest";
import { projektSchema } from "./projekt-schema";

const ID = "11111111-1111-4111-8111-111111111111";
const basis = { projektnummer: "P-(2400)448", name: "Wohnzimmer streichen", statusId: ID };

describe("projektSchema", () => {
  it("nimmt ein einfaches Projekt an, leere Felder bekommen Standardwerte", () => {
    expect(projektSchema.parse(basis)).toMatchObject({ contactId: null, bueroAnsprechpartnerId: null, strasse: "", startDatum: "" });
  });

  it("die Projektnummer darf leer sein (dann vergibt die App die nächste), Name und Status sind Pflicht", () => {
    expect(projektSchema.parse({ ...basis, projektnummer: " " }).projektnummer).toBe("");
    expect(projektSchema.safeParse({ ...basis, projektnummer: "x".repeat(41) }).success).toBe(false);
    expect(projektSchema.safeParse({ ...basis, name: "" }).success).toBe(false);
    expect(projektSchema.safeParse({ ...basis, statusId: "kein-status" }).success).toBe(false);
  });

  it("Mitarbeiter: Liste gültiger IDs, standardmäßig leer", () => {
    expect(projektSchema.parse(basis).mitarbeiterIds).toEqual([]);
    expect(projektSchema.parse({ ...basis, mitarbeiterIds: [ID] }).mitarbeiterIds).toEqual([ID]);
    expect(projektSchema.safeParse({ ...basis, mitarbeiterIds: ["kaputt"] }).success).toBe(false);
  });

  it("prüft Daten: gültig, Ende nicht vor Beginn", () => {
    expect(projektSchema.safeParse({ ...basis, startDatum: "2026-10-19", endDatum: "2026-10-23" }).success).toBe(true);
    const r = projektSchema.safeParse({ ...basis, startDatum: "2026-10-23", endDatum: "2026-10-19" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Das Ende darf nicht vor dem Beginn liegen.");
    expect(projektSchema.safeParse({ ...basis, startDatum: "2026-02-30" }).success).toBe(false);
  });
});
