// Berichte (Bautagesbericht): Rechte, Entwurf → abgeschlossen (unveränderlich), Unterschrift im privaten Speicher.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, a: TestNutzer, b: TestNutzer, fremd: TestNutzer;
let bueroC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient, fremdC: SupabaseClient;
let projekt: string, archiviert: string;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
      { projektnummer: `${kennung}-P2`, name: `${kennung} Archiv`, status_id: status!.id, archiviert_am: new Date().toISOString() },
    ])
    .select("id, projektnummer");
  const id = (s: string) => p!.find((x) => x.projektnummer.endsWith(s))!.id;
  [projekt, archiviert] = [id("P1"), id("P2")];
  await db.from("project_members").insert([
    { project_id: projekt, user_id: a.id, added_by: buero.id },
    { project_id: projekt, user_id: b.id, added_by: buero.id },
    { project_id: archiviert, user_id: a.id, added_by: buero.id },
  ]);
});

afterAll(async () => {
  const db = adminClient();
  const ids = [projekt, archiviert].filter(Boolean);
  for (const pid of ids) {
    const { data: dateien } = await db.storage.from("berichtunterschriften").list(pid);
    if (dateien?.length) await db.storage.from("berichtunterschriften").remove(dateien.map((d) => `${pid}/${d.name}`));
  }
  await db.from("project_reports").delete().in("project_id", ids);
  await db.from("project_members").delete().in("project_id", ids);
  await db.from("projects").delete().in("id", ids);
  await Promise.all([buero, a, b, fremd].map((n) => testNutzerLoeschen(n)));
});

const neu = (teil: object = {}) => ({ project_id: projekt, art: "bautagesbericht", datum: "2026-10-17", daten: { arbeiten: "Wände gestrichen" }, ...teil });

describe("Berichte anlegen und lesen", () => {
  let bericht: string;

  it("Mitglied und Büro legen Entwürfe an, Fremde und Nicht-Eingeloggte nicht", async () => {
    const r = await aC.from("project_reports").insert({ ...neu(), erstellt_von: a.id }).select("id").single();
    expect(r.error).toBeNull();
    bericht = r.data!.id;
    expect((await bueroC.from("project_reports").insert({ ...neu(), erstellt_von: buero.id })).error).toBeNull();
    expect((await fremdC.from("project_reports").insert({ ...neu(), erstellt_von: fremd.id })).error).not.toBeNull();
    expect((await anonClient().from("project_reports").insert(neu())).error).not.toBeNull();
  });

  it("niemand schreibt im Namen eines anderen; neue Berichte sind immer Entwürfe; nur bekannte Arten", async () => {
    expect((await aC.from("project_reports").insert({ ...neu(), erstellt_von: b.id })).error).not.toBeNull();
    expect((await aC.from("project_reports").insert({ ...neu(), erstellt_von: a.id, status: "abgeschlossen" })).error).not.toBeNull();
    expect((await aC.from("project_reports").insert({ ...neu({ art: "unbekannt" }), erstellt_von: a.id })).error).not.toBeNull();
  });

  it("in archivierten Projekten entstehen keine Berichte", async () => {
    expect((await aC.from("project_reports").insert({ ...neu({ project_id: archiviert }), erstellt_von: a.id })).error).not.toBeNull();
    expect((await bueroC.from("project_reports").insert({ ...neu({ project_id: archiviert }), erstellt_von: buero.id })).error).not.toBeNull();
  });

  it("Team und Büro lesen, Fremde und ohne Login nicht", async () => {
    expect((await bC.from("project_reports").select("id").eq("id", bericht)).data).toHaveLength(1);
    expect((await bueroC.from("project_reports").select("id").eq("id", bericht)).data).toHaveLength(1);
    expect((await fremdC.from("project_reports").select("id").eq("id", bericht)).data ?? []).toEqual([]);
    expect((await anonClient().from("project_reports").select("id")).data ?? []).toEqual([]);
  });

  it("ein Entwurf ist änderbar: vom Ersteller und vom Büro, nicht von Kollegen; löschen nie", async () => {
    expect((await aC.from("project_reports").update({ daten: { arbeiten: "Decke gestrichen" } }).eq("id", bericht).select("id")).data).toHaveLength(1);
    expect((await bueroC.from("project_reports").update({ datum: "2026-10-16" }).eq("id", bericht).select("id")).data).toHaveLength(1);
    expect((await bC.from("project_reports").update({ daten: { arbeiten: "Fremd" } }).eq("id", bericht).select("id")).data ?? []).toEqual([]);
    await aC.from("project_reports").delete().eq("id", bericht);
    expect((await adminClient().from("project_reports").select("id").eq("id", bericht)).data).toHaveLength(1);
  });

  it("Projekt und Art lassen sich nicht ändern", async () => {
    expect((await aC.from("project_reports").update({ project_id: archiviert }).eq("id", bericht)).error).not.toBeNull();
  });

  it("zu große Inhalte werden abgelehnt", async () => {
    const r = await aC.from("project_reports").update({ daten: { arbeiten: "x".repeat(31000) } }).eq("id", bericht);
    expect(r.error).not.toBeNull();
  });
});

describe("Abschließen und Unterschrift", () => {
  let bericht: string;
  let pfad: string;

  beforeAll(async () => {
    const r = await aC.from("project_reports").insert({ ...neu(), erstellt_von: a.id }).select("id").single();
    bericht = r.data!.id;
    pfad = `${projekt}/${bericht}.png`;
  });

  it("die Unterschrift liegt im privaten Speicher: Team und Büro dürfen, Fremde nicht, Überschreiben nicht", async () => {
    expect((await fremdC.storage.from("berichtunterschriften").upload(pfad, PNG, { contentType: "image/png" })).error).not.toBeNull();
    expect((await aC.storage.from("berichtunterschriften").upload(pfad, PNG, { contentType: "image/png" })).error).toBeNull();
    expect((await aC.storage.from("berichtunterschriften").upload(pfad, PNG, { contentType: "image/png", upsert: true })).error).not.toBeNull();
    expect((await aC.storage.from("berichtunterschriften").upload(`${projekt}/x.jpg`, PNG, { contentType: "image/jpeg" })).error).not.toBeNull();
    expect((await bC.storage.from("berichtunterschriften").download(pfad)).error).toBeNull();
    expect((await fremdC.storage.from("berichtunterschriften").download(pfad)).error).not.toBeNull();
  });

  it("Unterschrift ohne Name (oder nur Name) ist abgelehnt, ebenso eine Unterschrift im Entwurf", async () => {
    expect((await aC.from("project_reports").update({ unterschrift_pfad: pfad }).eq("id", bericht)).error).not.toBeNull();
    expect((await aC.from("project_reports").update({ unterschrift_name: "Kunde" }).eq("id", bericht)).error).not.toBeNull();
    expect((await aC.from("project_reports").update({ unterschrift_pfad: pfad, unterschrift_name: "Kunde", unterschrieben_am: new Date().toISOString() }).eq("id", bericht)).error).not.toBeNull();
  });

  it("Abschließen mit Unterschrift setzt den Zeitpunkt, danach ist alles gesperrt", async () => {
    const r = await aC
      .from("project_reports")
      .update({ status: "abgeschlossen", unterschrift_pfad: pfad, unterschrift_name: "Herr Kunde", unterschrieben_am: new Date().toISOString() })
      .eq("id", bericht)
      .select("status, abgeschlossen_am")
      .single();
    expect(r.error).toBeNull();
    expect(r.data?.abgeschlossen_am).not.toBeNull();

    const aendern = async (c: SupabaseClient, teil: object) => (await c.from("project_reports").update(teil).eq("id", bericht)).error?.code;
    expect(await aendern(aC, { daten: { arbeiten: "nachträglich" } })).toBe("P0001");
    expect(await aendern(bueroC, { datum: "2026-01-01" })).toBe("P0001");
    expect(await aendern(aC, { status: "entwurf" })).toBe("P0001");
    expect(await aendern(aC, { unterschrift_name: "Anderer" })).toBe("P0001");
  });

  it("einen abgeschlossenen Bericht archiviert nur das Büro", async () => {
    expect((await aC.from("project_reports").update({ archiviert_am: new Date().toISOString() }).eq("id", bericht)).error?.code).toBe("P0001");
    expect((await bueroC.from("project_reports").update({ archiviert_am: new Date().toISOString() }).eq("id", bericht).select("id")).data).toHaveLength(1);
  });

  it("ein Entwurf darf der Ersteller selbst archivieren", async () => {
    const r = await aC.from("project_reports").insert({ ...neu(), erstellt_von: a.id }).select("id").single();
    expect((await aC.from("project_reports").update({ archiviert_am: new Date().toISOString() }).eq("id", r.data!.id).select("id")).data).toHaveLength(1);
  });
});

describe("Berichtsarten (20.10.2026: wie in der Plancraft-App)", () => {
  it("alle neun Arten sind erlaubt, eine unbekannte nicht", async () => {
    const arten = ["abnahmeprotokoll", "aufmass", "baustellenbegehung", "bautagesbericht", "bedenkenanzeige", "besprechungsprotokoll", "checkliste", "einsatzbericht", "regiebericht"];
    for (const art of arten) {
      const r = await aC.from("project_reports").insert({ ...neu({ art, daten: { allgemein: {}, werte: {} } }), erstellt_von: a.id });
      expect(r.error, art).toBeNull();
    }
    expect((await aC.from("project_reports").insert({ ...neu({ art: "besprechung" }), erstellt_von: a.id })).error).not.toBeNull();
  });
});
