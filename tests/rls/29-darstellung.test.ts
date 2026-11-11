// Darstellung je Nutzer: jeder liest und ändert nur seine eigene Zeile; die Vorgabe der Firma (app_settings „darstellung“)
// darf ein Maler nicht ändern. Wegwerf-Nutzer, die Zeilen verschwinden mit dem Nutzer (on delete cascade).
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let a: TestNutzer, b: TestNutzer;
let aC: SupabaseClient, bC: SupabaseClient;

beforeAll(async () => {
  a = await testNutzerAnlegen("mitarbeiter");
  b = await testNutzerAnlegen("buero");
  aC = await einloggen(a.benutzername, a.passwort);
  bC = await einloggen(b.benutzername, b.passwort);
});

afterAll(async () => {
  await testNutzerLoeschen(a);
  await testNutzerLoeschen(b);
});

describe("nutzer_darstellung", () => {
  it("eigene Zeile anlegen, lesen und ändern", async () => {
    expect((await aC.from("nutzer_darstellung").upsert({ nutzer_id: a.id, akzent: "blau", reihenfolge: null, ausgeblendet: null })).error).toBeNull();
    const { data } = await aC.from("nutzer_darstellung").select("nutzer_id, akzent");
    expect(data).toEqual([{ nutzer_id: a.id, akzent: "blau" }]);
    expect((await aC.from("nutzer_darstellung").update({ akzent: "petrol" }).eq("nutzer_id", a.id)).error).toBeNull();
  });

  it("fremde Zeilen: nicht sehen, nicht ändern, nicht für andere anlegen", async () => {
    const { data } = await bC.from("nutzer_darstellung").select("nutzer_id");
    expect(data).toEqual([]);
    await bC.from("nutzer_darstellung").update({ akzent: "bordeaux" }).eq("nutzer_id", a.id);
    const { data: echt } = await adminClient().from("nutzer_darstellung").select("akzent").eq("nutzer_id", a.id).single();
    expect(echt!.akzent).toBe("petrol");
    expect((await bC.from("nutzer_darstellung").insert({ nutzer_id: a.id, akzent: "blau" })).error).not.toBeNull();
  });

  it("unbekannte Farbe lehnt die Datenbank ab", async () => {
    expect((await aC.from("nutzer_darstellung").update({ akzent: "pink" }).eq("nutzer_id", a.id)).error).not.toBeNull();
  });

  it("Vorgabe der Firma: Maler darf sie nicht schreiben", async () => {
    const r = await aC.from("app_settings").upsert({ schluessel: "darstellung", wert: { akzent: "blau" } });
    expect(r.error).not.toBeNull();
  });
});
