// Projekt-Chat: Lesen/Schreiben nur Büro und Mitglieder, Anhänge nur aus dem eigenen Projekt, Nachrichten unveränderlich, Neu-Zähler.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, a: TestNutzer, b: TestNutzer, fremd: TestNutzer;
let bueroC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient, fremdC: SupabaseClient;
let projekt: string, projekt2: string, archiviert: string;
let foto2: string, datei1: string;

beforeAll(async () => {
  [buero, a, b, fremd] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, aC, bC, fremdC] = await Promise.all([
    einloggen(buero.benutzername, buero.passwort),
    einloggen(a.benutzername, a.passwort),
    einloggen(b.benutzername, b.passwort),
    einloggen(fremd.benutzername, fremd.passwort),
  ]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
  const { data: p } = await db
    .from("projects")
    .insert([
      { projektnummer: `${kennung}-P1`, name: `${kennung} Eins`, status_id: status!.id },
      { projektnummer: `${kennung}-P2`, name: `${kennung} Zwei`, status_id: status!.id },
      { projektnummer: `${kennung}-P3`, name: `${kennung} Archiv`, status_id: status!.id, archiviert_am: new Date().toISOString() },
    ])
    .select("id, projektnummer");
  const id = (s: string) => p!.find((x) => x.projektnummer.endsWith(s))!.id;
  [projekt, projekt2, archiviert] = [id("P1"), id("P2"), id("P3")];
  await db.from("project_members").insert([
    { project_id: projekt, user_id: a.id, added_by: buero.id },
    { project_id: projekt, user_id: b.id, added_by: buero.id },
    { project_id: archiviert, user_id: a.id, added_by: buero.id },
  ]);
  const f = await db.from("project_photos").insert({ project_id: projekt2, storage_pfad: `${projekt2}/${crypto.randomUUID()}.jpg`, erstellt_von: buero.id }).select("id").single();
  foto2 = f.data!.id;
  const d = await db.from("project_files").insert({ project_id: projekt, storage_pfad: `${projekt}/${crypto.randomUUID()}.pdf`, dateiname: "x.pdf", erstellt_von: a.id }).select("id").single();
  datei1 = d.data!.id;
});

afterAll(async () => {
  const db = adminClient();
  const ids = [projekt, projekt2, archiviert].filter(Boolean);
  await db.from("chat_reads").delete().in("project_id", ids);
  await db.from("project_messages").delete().in("project_id", ids);
  await db.from("project_files").delete().in("project_id", ids);
  await db.from("project_photos").delete().in("project_id", ids);
  await db.from("project_members").delete().in("project_id", ids);
  await db.from("projects").delete().in("id", ids);
  await Promise.all([buero, a, b, fremd].map((n) => testNutzerLoeschen(n)));
});

describe("Nachrichten schreiben und lesen", () => {
  let nachricht: string;

  it("Mitglied und Büro schreiben, Fremde und Nicht-Eingeloggte nicht", async () => {
    const r = await aC.from("project_messages").insert({ project_id: projekt, text: "Farbe ist da", erstellt_von: a.id }).select("id").single();
    expect(r.error).toBeNull();
    nachricht = r.data!.id;
    expect((await bueroC.from("project_messages").insert({ project_id: projekt, text: "Danke", erstellt_von: buero.id })).error).toBeNull();
    expect((await fremdC.from("project_messages").insert({ project_id: projekt, text: "Hack", erstellt_von: fremd.id })).error).not.toBeNull();
    expect((await anonClient().from("project_messages").insert({ project_id: projekt, text: "Hack" })).error).not.toBeNull();
  });

  it("niemand schreibt im Namen eines anderen", async () => {
    expect((await aC.from("project_messages").insert({ project_id: projekt, text: "x", erstellt_von: b.id })).error).not.toBeNull();
  });

  it("Mitglieder und Büro lesen, Fremde nicht, ohne Login nicht", async () => {
    expect((await bC.from("project_messages").select("id").eq("id", nachricht)).data).toHaveLength(1);
    expect((await bueroC.from("project_messages").select("id").eq("id", nachricht)).data).toHaveLength(1);
    expect((await fremdC.from("project_messages").select("id").eq("id", nachricht)).data ?? []).toEqual([]);
    expect((await anonClient().from("project_messages").select("id")).data ?? []).toEqual([]);
  });

  it("leere Nachrichten, zu lange und zwei Anhänge zugleich sind abgelehnt", async () => {
    const f = async (teil: object) => (await aC.from("project_messages").insert({ project_id: projekt, erstellt_von: a.id, ...teil })).error;
    expect(await f({ text: "  " })).not.toBeNull();
    expect(await f({ text: "x".repeat(2001) })).not.toBeNull();
    expect(await f({ text: "mit Datei", datei_id: datei1 })).toBeNull();
    expect(await f({ text: "beides", datei_id: datei1, foto_id: foto2 })).not.toBeNull();
  });

  it("ein Anhang muss zum selben Projekt gehören", async () => {
    expect((await aC.from("project_messages").insert({ project_id: projekt, text: "fremdes Foto", foto_id: foto2, erstellt_von: a.id })).error).not.toBeNull();
  });

  it("in archivierten Projekten schreibt niemand mehr", async () => {
    expect((await aC.from("project_messages").insert({ project_id: archiviert, text: "zu spät", erstellt_von: a.id })).error).not.toBeNull();
    expect((await bueroC.from("project_messages").insert({ project_id: archiviert, text: "zu spät", erstellt_von: buero.id })).error).not.toBeNull();
  });

  it("der Inhalt ändert sich nie; eigene Nachricht archivieren geht, fremde nicht, löschen nie", async () => {
    expect((await aC.from("project_messages").update({ text: "geändert" }).eq("id", nachricht)).error?.code).toBe("P0001");
    expect((await bC.from("project_messages").update({ archiviert_am: new Date().toISOString() }).eq("id", nachricht).select("id")).data ?? []).toEqual([]);
    expect((await aC.from("project_messages").update({ archiviert_am: new Date().toISOString() }).eq("id", nachricht).select("id")).data).toHaveLength(1);
    await aC.from("project_messages").delete().eq("id", nachricht);
    expect((await adminClient().from("project_messages").select("id").eq("id", nachricht)).data).toHaveLength(1);
  });
});

describe("Neu-Zähler", () => {
  const zaehle = async (c: SupabaseClient) => {
    const { data } = await c.rpc("chat_ungelesen");
    return Number(((data ?? []) as { project_id: string; anzahl: number }[]).find((x) => x.project_id === projekt)?.anzahl ?? 0);
  };

  it("zählt fremde, ungelesene Nachrichten je Projekt und nullt sich beim Lesen", async () => {
    const vorher = await zaehle(bC);
    await aC.from("project_messages").insert({ project_id: projekt, text: "Noch eine", erstellt_von: a.id });
    expect(await zaehle(bC)).toBe(vorher + 1);

    // „Gelesen“ setzt die Datenbank mit ihrer eigenen Uhr (Uhren von App und Datenbank können abweichen).
    expect((await bC.rpc("chat_gelesen_markieren", { p_projekt: projekt })).error).toBeNull();
    expect(await zaehle(bC)).toBe(0);
    // Noch einmal markieren (Aktualisieren statt Anlegen) und danach kommt eine neue Nachricht an.
    await aC.from("project_messages").insert({ project_id: projekt, text: "Und noch eine", erstellt_von: a.id });
    expect(await zaehle(bC)).toBe(1);
    expect((await bC.rpc("chat_gelesen_markieren", { p_projekt: projekt })).error).toBeNull();
    expect(await zaehle(bC)).toBe(0);
  });

  it("eigene Nachrichten zählen nicht mit", async () => {
    const vorher = await zaehle(aC);
    await aC.from("project_messages").insert({ project_id: projekt, text: "Von mir", erstellt_von: a.id });
    expect(await zaehle(aC)).toBe(vorher);
  });

  it("Gelesen-Markierungen sind privat und nur für Berechtigte", async () => {
    expect((await aC.from("chat_reads").select("user_id").eq("user_id", b.id)).data ?? []).toEqual([]);
    expect((await fremdC.from("chat_reads").insert({ project_id: projekt, user_id: fremd.id })).error).not.toBeNull();
    expect((await fremdC.rpc("chat_gelesen_markieren", { p_projekt: projekt })).error).not.toBeNull();
    expect((await bC.from("chat_reads").upsert({ project_id: projekt, user_id: a.id })).error).not.toBeNull();
  });
});
