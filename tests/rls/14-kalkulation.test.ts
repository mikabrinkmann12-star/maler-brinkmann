// Kalkulation (Zuschläge, Lohngruppen): Büro und Admin lesen, nur der Admin ändert, Mitarbeiter und Fremde sehen nichts;
// keine neue Zeile, kein Löschen. Dazu die gespeicherte Zusammensetzung einer Leistung (services.kalkulation).
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let admin: TestNutzer, buero: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, malerC: SupabaseClient;
let vorher: { zuschlaege: unknown; lohngruppen: unknown };

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
  const { data } = await adminClient().from("kalkulation_einstellungen").select("zuschlaege, lohngruppen").single();
  vorher = data!;
});

afterAll(async () => {
  // Die echten Einstellungen wiederherstellen und die Test-Leistung samt Nutzern entfernen
  const a = adminClient();
  await a.from("kalkulation_einstellungen").update({ zuschlaege: vorher.zuschlaege, lohngruppen: vorher.lohngruppen }).eq("einzig", true);
  await a.from("services").delete().like("name", `${kennung}%`);
  await a.from("kalkulation_einstellungen").update({ updated_by: null }).eq("einzig", true);
  await Promise.all([admin, buero, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Kalkulations-Einstellungen", () => {
  it("es gibt genau eine Zeile mit den Startwerten aus Plancraft", async () => {
    const r = await adminClient().from("kalkulation_einstellungen").select("zuschlaege, lohngruppen");
    expect(r.data).toHaveLength(1);
    expect(vorher.zuschlaege).toMatchObject({ material: expect.any(Number), geraete: expect.any(Number), fremdleistung: expect.any(Number), sonstiges: expect.any(Number) });
    expect(Array.isArray(vorher.lohngruppen)).toBe(true);
  });

  it("Büro und Admin lesen, Mitarbeiter und Fremde sehen nichts", async () => {
    expect((await adminC.from("kalkulation_einstellungen").select("id")).data).toHaveLength(1);
    expect((await bueroC.from("kalkulation_einstellungen").select("id")).data).toHaveLength(1);
    expect((await malerC.from("kalkulation_einstellungen").select("id")).data ?? []).toEqual([]);
    expect((await anonClient().from("kalkulation_einstellungen").select("id")).data ?? []).toEqual([]);
  });

  it("nur der Admin ändert", async () => {
    const neu = { material: 45, geraete: 6, fremdleistung: 1, sonstiges: 4 };
    expect((await bueroC.from("kalkulation_einstellungen").update({ zuschlaege: neu }).eq("einzig", true).select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("kalkulation_einstellungen").update({ zuschlaege: neu }).eq("einzig", true).select("id")).data ?? []).toEqual([]);
    expect((await adminC.from("kalkulation_einstellungen").update({ zuschlaege: neu }).eq("einzig", true).select("id")).data).toHaveLength(1);
    const gelesen = await bueroC.from("kalkulation_einstellungen").select("zuschlaege").single();
    expect(gelesen.data?.zuschlaege).toEqual(neu);
  });

  it("keine zweite Zeile und kein Löschen", async () => {
    const zweite = await adminC.from("kalkulation_einstellungen").insert({ zuschlaege: {}, lohngruppen: [] });
    expect(zweite.error).not.toBeNull();
    await adminC.from("kalkulation_einstellungen").delete().eq("einzig", true);
    expect((await adminClient().from("kalkulation_einstellungen").select("id")).data).toHaveLength(1);
  });
});

describe("Zusammensetzung einer Leistung", () => {
  it("Büro speichert Kosten, Zuschlag und die Kalkulation; der Verkaufspreis rechnet die Datenbank", async () => {
    const kalk = { lohngruppeId: "standard", lohnMinuten: 12, material: 3.2, geraete: 0, fremdleistung: 0, sonstiges: 0 };
    const r = await bueroC
      .from("services")
      .insert({ name: `${kennung} Wand`, einheit: "m²", kosten: 8.176, zuschlag_prozent: 71.0, kalkulation: kalk })
      .select("id, vk, kalkulation")
      .single();
    expect(r.error).toBeNull();
    expect(Number(r.data!.vk)).toBe(13.98); // 8,176 × 1,71 = 13,98096 → 13,98
    expect(r.data!.kalkulation).toEqual(kalk);
  });

  it("Mitarbeiter sehen die Leistungen und ihre Kalkulation nicht", async () => {
    expect((await malerC.from("services").select("id, kalkulation").like("name", `${kennung}%`)).data ?? []).toEqual([]);
  });
});
