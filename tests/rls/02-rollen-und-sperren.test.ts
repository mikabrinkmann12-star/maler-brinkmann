// Nutzerverwaltung: Wer darf Rollen/Status ändern, wirkt es sofort,
// und sieht ein gesperrter Nutzer wirklich nichts mehr?
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  einloggen,
  testNutzerAnlegen,
  testNutzerLoeschen,
  type TestNutzer,
} from "./hilfen";

let admin: TestNutzer;
let buero: TestNutzer;
let maler: TestNutzer;
let ziel: TestNutzer;
let adminC: SupabaseClient;
let bueroC: SupabaseClient;
let malerC: SupabaseClient;
let zielC: SupabaseClient;

async function profilVon(id: string) {
  const { data } = await adminClient()
    .from("profiles")
    .select("rolle, aktiv, muss_passwort_aendern")
    .eq("id", id)
    .single();
  return data;
}

beforeAll(async () => {
  [admin, buero, maler, ziel] = await Promise.all([
    testNutzerAnlegen("admin"),
    testNutzerAnlegen("buero"),
    testNutzerAnlegen("mitarbeiter"),
    testNutzerAnlegen("mitarbeiter"),
  ]);
  adminC = await einloggen(admin.benutzername, admin.passwort);
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  malerC = await einloggen(maler.benutzername, maler.passwort);
  zielC = await einloggen(ziel.benutzername, ziel.passwort);
});

afterAll(async () => {
  await Promise.all([admin, buero, maler, ziel].map(testNutzerLoeschen));
});

describe("Profile sehen", () => {
  it("ein Maler sieht nur sein eigenes Profil", async () => {
    const { data } = await malerC.from("profiles").select("id");
    expect(data).toEqual([{ id: maler.id }]);
  });

  it("ohne Login sieht man keine Profile", async () => {
    const { data } = await anonClient().from("profiles").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("Büro und Admin sehen alle Profile", async () => {
    for (const client of [bueroC, adminC]) {
      const { data } = await client.from("profiles").select("id");
      const ids = (data ?? []).map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining([admin.id, buero.id, maler.id, ziel.id]));
    }
  });
});

describe("Rollen und Status ändern", () => {
  it("ein Maler kann seine Rolle, aktiv und das Passwort-Flag nicht ändern", async () => {
    const { data } = await malerC
      .from("profiles")
      .update({ rolle: "admin", aktiv: true, muss_passwort_aendern: false })
      .eq("id", maler.id)
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(await profilVon(maler.id)).toMatchObject({ rolle: "mitarbeiter" });
  });

  it("das Büro kann keine Rollen ändern", async () => {
    const { data } = await bueroC
      .from("profiles")
      .update({ rolle: "admin" })
      .eq("id", buero.id)
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(await profilVon(buero.id)).toMatchObject({ rolle: "buero" });
  });

  it("eine Rollenänderung durch den Admin gilt sofort, auch mit altem Token", async () => {
    expect((await zielC.rpc("ist_buero_oder_admin")).data).toBe(false);

    const { error } = await adminC.from("profiles").update({ rolle: "buero" }).eq("id", ziel.id);
    expect(error).toBeNull();
    expect((await zielC.rpc("ist_buero_oder_admin")).data).toBe(true);

    await adminC.from("profiles").update({ rolle: "mitarbeiter" }).eq("id", ziel.id);
    expect((await zielC.rpc("ist_buero_oder_admin")).data).toBe(false);
  });

  it("das Änderungsprotokoll zeigt, welcher Admin die Rolle geändert hat", async () => {
    const { data } = await adminClient()
      .from("audit_log")
      .select("aktion, geaendert_von, alt, neu")
      .eq("tabelle", "profiles")
      .eq("datensatz_id", ziel.id)
      .eq("aktion", "UPDATE");
    const rollenwechsel = (data ?? []).find(
      (e) => e.alt?.rolle === "mitarbeiter" && e.neu?.rolle === "buero",
    );
    expect(rollenwechsel?.geaendert_von).toBe(admin.id);
  });

  it("ein Admin kann sich nicht selbst die Admin-Rolle nehmen", async () => {
    const { error } = await adminC.from("profiles").update({ rolle: "buero" }).eq("id", admin.id);
    expect(error?.code).toBe("P0001");
    expect(await profilVon(admin.id)).toMatchObject({ rolle: "admin" });
  });

  it("ein Admin kann sich nicht selbst deaktivieren", async () => {
    const { error } = await adminC.from("profiles").update({ aktiv: false }).eq("id", admin.id);
    expect(error?.code).toBe("P0001");
    expect(await profilVon(admin.id)).toMatchObject({ aktiv: true });
  });
});

describe("Gesperrter Nutzer", () => {
  it("sieht mit seinem noch gültigen Token nichts mehr und kann sich nicht neu anmelden", async () => {
    // Gleiche Schritte wie die Aktion „Zugang sperren“
    const { error } = await adminC.from("profiles").update({ aktiv: false }).eq("id", ziel.id);
    expect(error).toBeNull();
    await adminClient().auth.admin.updateUserById(ziel.id, { ban_duration: "876000h" });
    await adminClient().rpc("nutzer_sessions_beenden", { p_user_id: ziel.id });

    const profile = await zielC.from("profiles").select("id");
    expect(profile.data ?? []).toEqual([]);
    const statusse = await zielC.from("project_statuses").select("id");
    expect(statusse.data ?? []).toEqual([]);
    expect((await zielC.rpc("ist_aktiv")).data ?? false).toBe(false);

    await expect(einloggen(ziel.benutzername, ziel.passwort)).rejects.toThrow();
  });
});
