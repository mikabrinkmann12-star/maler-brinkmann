// Neue Zeit-Arten Bildung und Feiertag: Büro kann sie eintragen, sie brauchen kein Projekt; Mitarbeiter nur, wenn der Admin sie freigibt.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let buero: TestNutzer, maler: TestNutzer;
let bueroC: SupabaseClient, malerC: SupabaseClient;
let altEinstellung: unknown = null;

beforeAll(async () => {
  [buero, maler] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, malerC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(maler.benutzername, maler.passwort)]);
  const { data } = await adminClient().from("app_settings").select("wert").eq("schluessel", "zeiterfassung").maybeSingle();
  altEinstellung = data?.wert ?? null;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("time_entries").delete().in("user_id", [buero.id, maler.id]);
  if (altEinstellung) await db.from("app_settings").update({ wert: altEinstellung }).eq("schluessel", "zeiterfassung");
  await Promise.all([buero, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Bildung und Feiertag", () => {
  it("Büro trägt beide Arten ohne Projekt ein", async () => {
    for (const [art, tag] of [["bildung", "2026-09-01"], ["feiertag", "2026-09-02"]] as const) {
      const r = await bueroC.from("time_entries").insert({ user_id: maler.id, datum: tag, art, stunden: 8.5 }).select("id, art").single();
      expect(r.error).toBeNull();
      expect(r.data!.art).toBe(art);
    }
  });

  it("Mitarbeiter dürfen sie nur eintragen, wenn der Admin sie in den Einstellungen erlaubt", async () => {
    const db = adminClient();
    const basis = (altEinstellung ?? {}) as Record<string, unknown>;
    const heute = new Date().toISOString().slice(0, 10);

    await db.from("app_settings").upsert({ schluessel: "zeiterfassung", wert: { ...basis, erlaubte_arten: ["arbeitszeit"] } });
    expect((await malerC.from("time_entries").insert({ user_id: maler.id, datum: heute, art: "bildung", stunden: 8 })).error).not.toBeNull();

    await db.from("app_settings").upsert({ schluessel: "zeiterfassung", wert: { ...basis, erlaubte_arten: ["arbeitszeit", "bildung", "feiertag"] } });
    expect((await malerC.from("time_entries").insert({ user_id: maler.id, datum: heute, art: "bildung", stunden: 8 })).error).toBeNull();
  });
});
