// Eigenes Profil und Benachrichtigungen (Mitarbeiter-App): jeder ändert nur sich selbst und nur Name,
// Mobilnummer bzw. seine Schalter. Rolle bleibt tabu, anonym geht nichts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let a: TestNutzer, b: TestNutzer;
let aC: SupabaseClient;

beforeAll(async () => {
  [a, b] = await Promise.all([testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  aC = await einloggen(a.benutzername, a.passwort);
});

afterAll(async () => {
  await Promise.all([a, b].map((n) => testNutzerLoeschen(n)));
});

describe("eigenes Profil", () => {
  it("ändert Name und Mobilnummer der eigenen Zeile", async () => {
    const r = await aC.rpc("eigenes_profil_speichern", { p_vorname: " Anna ", p_nachname: "Beispiel", p_telefon: " 0171 123 " });
    expect(r.error).toBeNull();
    const { data } = await adminClient().from("profiles").select("vorname, nachname, telefon, rolle").eq("id", a.id).single();
    expect(data).toEqual({ vorname: "Anna", nachname: "Beispiel", telefon: "0171 123", rolle: "mitarbeiter" });
  });

  it("leere Mobilnummer wird zu null, der Nachname darf leer sein", async () => {
    const r = await aC.rpc("eigenes_profil_speichern", { p_vorname: "Anna", p_nachname: "", p_telefon: "  " });
    expect(r.error).toBeNull();
    const { data } = await adminClient().from("profiles").select("nachname, telefon").eq("id", a.id).single();
    expect(data).toEqual({ nachname: "", telefon: null });
  });

  it("verlangt einen Vornamen und prüft die Längen", async () => {
    expect((await aC.rpc("eigenes_profil_speichern", { p_vorname: " ", p_nachname: "", p_telefon: "" })).error).not.toBeNull();
    expect((await aC.rpc("eigenes_profil_speichern", { p_vorname: "x".repeat(51), p_nachname: "", p_telefon: "" })).error).not.toBeNull();
    expect((await aC.rpc("eigenes_profil_speichern", { p_vorname: "A", p_nachname: "", p_telefon: "1".repeat(31) })).error).not.toBeNull();
  });

  it("ändert nie die Zeile eines anderen", async () => {
    await aC.rpc("eigenes_profil_speichern", { p_vorname: "Nur ich", p_nachname: "", p_telefon: "" });
    const { data } = await adminClient().from("profiles").select("vorname").eq("id", b.id).single();
    expect(data?.vorname).toBe("Test");
  });

  it("die Tabelle selbst darf ein Mitarbeiter weiterhin nicht ändern (Rolle!)", async () => {
    const r = await aC.from("profiles").update({ rolle: "admin" }).eq("id", a.id).select("id");
    expect(r.data ?? []).toHaveLength(0);
    const { data } = await adminClient().from("profiles").select("rolle").eq("id", a.id).single();
    expect(data?.rolle).toBe("mitarbeiter");
  });

  it("ohne Login geht es nicht", async () => {
    const r = await anonClient().rpc("eigenes_profil_speichern", { p_vorname: "X", p_nachname: "", p_telefon: "" });
    expect(r.error).not.toBeNull();
  });
});

describe("eigene Benachrichtigungen", () => {
  it("speichert die Schalter in der eigenen Zeile", async () => {
    const wert = { projekt_zugewiesen: true, chat: false, arbeitszeit: true, urlaub: true };
    expect((await aC.rpc("eigene_benachrichtigungen_speichern", { p_wert: wert })).error).toBeNull();
    const { data } = await adminClient().from("profiles").select("benachrichtigungen").eq("id", a.id).single();
    expect(data?.benachrichtigungen).toEqual(wert);
    const { data: fremd } = await adminClient().from("profiles").select("benachrichtigungen").eq("id", b.id).single();
    expect(fremd?.benachrichtigungen).toEqual({});
  });

  it("lehnt Unsinn ab", async () => {
    expect((await aC.rpc("eigene_benachrichtigungen_speichern", { p_wert: [1] })).error).not.toBeNull();
    expect((await aC.rpc("eigene_benachrichtigungen_speichern", { p_wert: { x: "y".repeat(2000) } })).error).not.toBeNull();
  });

  it("ohne Login geht es nicht", async () => {
    expect((await anonClient().rpc("eigene_benachrichtigungen_speichern", { p_wert: {} })).error).not.toBeNull();
  });
});
