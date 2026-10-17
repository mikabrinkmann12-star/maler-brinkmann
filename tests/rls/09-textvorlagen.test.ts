// Textvorlagen für Angebote: nur der Admin legt an und ändert, Büro und Admin lesen, Mitarbeiter nichts; Eindeutigkeit, kein Löschen.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let admin: TestNutzer, buero: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, malerC: SupabaseClient;
let vorlage: string;

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
});

afterAll(async () => {
  await adminClient().from("text_templates").delete().like("name", `${kennung}%`);
  await Promise.all([admin, buero, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Textvorlagen", () => {
  it("der Admin legt Vorlagen an", async () => {
    const r = await adminC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Privat`, inhalt: "Hallo Privatkunde", standard: true }).select("id").single();
    expect(r.error).toBeNull();
    vorlage = r.data!.id;
    expect((await adminC.from("text_templates").insert({ art: "schlusstext", name: `${kennung} Privat`, inhalt: "Danke" })).error).toBeNull(); // gleicher Name, andere Art
  });

  it("Büro darf lesen, aber nicht anlegen oder ändern; Mitarbeiter und Fremde sehen nichts", async () => {
    expect((await bueroC.from("text_templates").select("id").eq("id", vorlage)).data).toHaveLength(1);
    expect((await bueroC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Büro`, inhalt: "x" })).error).not.toBeNull();
    expect((await bueroC.from("text_templates").update({ inhalt: "geändert" }).eq("id", vorlage).select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("text_templates").select("id").eq("id", vorlage)).data ?? []).toEqual([]);
    expect((await malerC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Hack`, inhalt: "x" })).error).not.toBeNull();
    expect((await anonClient().from("text_templates").select("id")).data ?? []).toEqual([]);
  });

  it("Name je Art eindeutig, höchstens eine Standard-Vorlage je Art", async () => {
    expect((await adminC.from("text_templates").insert({ art: "einleitung", name: ` ${kennung.toLowerCase()} PRIVAT `, inhalt: "x" })).error?.code).toBe("23505");
    expect((await adminC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Gewerbe`, inhalt: "x", standard: true })).error?.code).toBe("23505");
    expect((await adminC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Gewerbe`, inhalt: "x", standard: false })).error).toBeNull();
  });

  it("Prüfungen: Name und Text nicht leer, nicht zu lang", async () => {
    const f = async (teil: object) => (await adminC.from("text_templates").insert({ art: "einleitung", name: `${kennung} P`, inhalt: "x", ...teil })).error;
    expect(await f({ name: " " })).not.toBeNull();
    expect(await f({ inhalt: " " })).not.toBeNull();
    expect(await f({ inhalt: "x".repeat(3001) })).not.toBeNull();
    expect(await f({ art: "betreff" })).not.toBeNull();
  });

  it("niemand löscht eine Vorlage; archivieren geht und gibt den Namen frei", async () => {
    await adminC.from("text_templates").delete().eq("id", vorlage);
    expect((await adminClient().from("text_templates").select("id").eq("id", vorlage)).data).toHaveLength(1);
    expect((await adminC.from("text_templates").update({ archiviert_am: new Date().toISOString(), standard: false }).eq("id", vorlage)).error).toBeNull();
    expect((await adminC.from("text_templates").insert({ art: "einleitung", name: `${kennung} Privat`, inhalt: "neu", standard: true })).error).toBeNull();
  });
});
