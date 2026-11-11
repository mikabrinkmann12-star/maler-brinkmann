// Eingangsrechnungen löschen: nur solange „zu prüfen“ (keine Rechnung, z. B. Werbung aus dem Postfach); geprüfte bleiben.
// Wegwerf-Daten, werden wieder entfernt.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let buero: TestNutzer, maler: TestNutzer;
let bueroC: SupabaseClient, malerC: SupabaseClient;
const angelegt: { id: string; pfad: string }[] = [];

async function eintrag(zuPruefen: boolean) {
  const id = randomUUID();
  const pfad = `${id}.pdf`;
  expect((await bueroC.storage.from("eingangsrechnungen").upload(pfad, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }))).error).toBeNull();
  const r = await bueroC.from("incoming_invoices").insert({ id, lieferant: "TEST-Lieferant", storage_pfad: pfad, dateiname: "test.pdf", zu_pruefen: zuPruefen, erstellt_von: buero.id });
  expect(r.error).toBeNull();
  angelegt.push({ id, pfad });
  return { id, pfad };
}

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  maler = await testNutzerAnlegen("mitarbeiter");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  malerC = await einloggen(maler.benutzername, maler.passwort);
});

afterAll(async () => {
  const db = adminClient();
  for (const a of angelegt) {
    await db.storage.from("eingangsrechnungen").remove([a.pfad]);
    await db.from("incoming_invoices").delete().eq("id", a.id);
  }
  await testNutzerLoeschen(buero);
  await testNutzerLoeschen(maler);
});

describe("Eingangsrechnung löschen", () => {
  it("ungeprüft: Büro löscht Datei und Eintrag", async () => {
    const e = await eintrag(true);
    expect((await malerC.from("incoming_invoices").delete().eq("id", e.id).select("id")).data ?? []).toEqual([]);
    const { data: weg } = await bueroC.storage.from("eingangsrechnungen").remove([e.pfad]);
    expect(weg?.length).toBe(1);
    expect((await bueroC.from("incoming_invoices").delete().eq("id", e.id).select("id")).data).toHaveLength(1);
  });

  it("geprüft: weder Eintrag noch Datei lassen sich löschen", async () => {
    const e = await eintrag(false);
    expect((await bueroC.from("incoming_invoices").delete().eq("id", e.id).select("id")).data ?? []).toEqual([]);
    const { data: weg } = await bueroC.storage.from("eingangsrechnungen").remove([e.pfad]);
    expect(weg ?? []).toEqual([]);
    const { data } = await adminClient().from("incoming_invoices").select("id").eq("id", e.id);
    expect(data).toHaveLength(1);
  });
});
