// Ablage mit Dateien: Rechte (Büro, Mitglied, Fremder, archiviertes Projekt) und Speicher (nur Dokumenttypen, nur im eigenen Projekt).
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

let buero: TestNutzer, mitglied: TestNutzer, fremd: TestNutzer;
let bueroC: SupabaseClient, mitgliedC: SupabaseClient, fremdC: SupabaseClient;
let projekt: string, archiviert: string;
const dateiIds: string[] = [];
const pfade: string[] = [];

beforeAll(async () => {
  [buero, mitglied, fremd] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, mitgliedC, fremdC] = await Promise.all([
    einloggen(buero.benutzername, buero.passwort),
    einloggen(mitglied.benutzername, mitglied.passwort),
    einloggen(fremd.benutzername, fremd.passwort),
  ]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
  const { data: p } = await db.from("projects").insert([
    { projektnummer: `${kennung}-P1`, name: `${kennung} Aktiv`, status_id: status!.id },
    { projektnummer: `${kennung}-P2`, name: `${kennung} Archiv`, status_id: status!.id, archiviert_am: new Date().toISOString() },
  ]).select("id, projektnummer");
  projekt = p!.find((x) => x.projektnummer.endsWith("P1"))!.id;
  archiviert = p!.find((x) => x.projektnummer.endsWith("P2"))!.id;
  await db.from("project_members").insert({ project_id: projekt, user_id: mitglied.id, added_by: buero.id });
});

afterAll(async () => {
  const db = adminClient();
  if (pfade.length) await db.storage.from("projektdateien").remove(pfade);
  await db.from("project_files").delete().in("project_id", [projekt, archiviert].filter(Boolean));
  await db.from("project_members").delete().eq("project_id", projekt);
  await db.from("projects").delete().in("id", [projekt, archiviert].filter(Boolean));
  await Promise.all([buero, mitglied, fremd].map((n) => testNutzerLoeschen(n)));
});

async function hochladen(client: SupabaseClient, projektId: string, endung = "pdf", typ = "application/pdf") {
  const id = crypto.randomUUID();
  const pfad = `${projektId}/${id}.${endung}`;
  pfade.push(pfad);
  const r = await client.storage.from("projektdateien").upload(pfad, pdf, { contentType: typ });
  return { id, pfad, error: r.error };
}

describe("Speicher", () => {
  it("Mitglied und Büro laden Dokumente hoch, Fremde nicht", async () => {
    expect((await hochladen(mitgliedC, projekt)).error).toBeNull();
    expect((await hochladen(bueroC, projekt)).error).toBeNull();
    expect((await hochladen(fremdC, projekt)).error).not.toBeNull();
    expect((await anonClient().storage.from("projektdateien").upload(`${projekt}/${crypto.randomUUID()}.pdf`, pdf, { contentType: "application/pdf" })).error).not.toBeNull();
  });

  it("nur Dokumenttypen: Bilder und Programme sind abgelehnt", async () => {
    expect((await hochladen(mitgliedC, projekt, "jpg", "image/jpeg")).error).not.toBeNull();
    expect((await hochladen(mitgliedC, projekt, "exe", "application/x-msdownload")).error).not.toBeNull();
    expect((await hochladen(mitgliedC, projekt, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).error).toBeNull();
  });
});

describe("Datensätze", () => {
  let datei: { id: string; pfad: string };

  it("Mitglied legt einen Eintrag an; der Ersteller muss er selbst sein", async () => {
    const h = await hochladen(mitgliedC, projekt);
    datei = h;
    dateiIds.push(h.id);
    const ok = await mitgliedC.from("project_files").insert({ id: h.id, project_id: projekt, storage_pfad: h.pfad, dateiname: "Plan.pdf", mime: "application/pdf", groesse_bytes: 8, erstellt_von: mitglied.id });
    expect(ok.error).toBeNull();
    const fremdName = await mitgliedC.from("project_files").insert({ project_id: projekt, storage_pfad: `${projekt}/${crypto.randomUUID()}.pdf`, dateiname: "x.pdf", erstellt_von: buero.id });
    expect(fremdName.error).not.toBeNull();
    const andererPfad = await mitgliedC.from("project_files").insert({ project_id: projekt, storage_pfad: `${archiviert}/${crypto.randomUUID()}.pdf`, dateiname: "x.pdf", erstellt_von: mitglied.id });
    expect(andererPfad.error).not.toBeNull();
  });

  it("Fremde und Nicht-Eingeloggte sehen und legen nichts an", async () => {
    expect((await fremdC.from("project_files").select("id").eq("id", datei.id)).data ?? []).toEqual([]);
    expect((await fremdC.from("project_files").insert({ project_id: projekt, storage_pfad: `${projekt}/${crypto.randomUUID()}.pdf`, dateiname: "x.pdf", erstellt_von: fremd.id })).error).not.toBeNull();
    expect((await anonClient().from("project_files").select("id")).data ?? []).toEqual([]);
    expect((await fremdC.storage.from("projektdateien").download(datei.pfad)).error).not.toBeNull();
  });

  it("Mitglied und Büro lesen Eintrag und Datei", async () => {
    expect((await mitgliedC.from("project_files").select("id").eq("id", datei.id)).data).toHaveLength(1);
    expect((await bueroC.from("project_files").select("id").eq("id", datei.id)).data).toHaveLength(1);
    expect((await mitgliedC.storage.from("projektdateien").download(datei.pfad)).error).toBeNull();
    expect((await bueroC.storage.from("projektdateien").download(datei.pfad)).error).toBeNull();
  });

  it("nur Büro oder der Ersteller archiviert; niemand löscht", async () => {
    const andere = await hochladen(bueroC, projekt);
    await bueroC.from("project_files").insert({ id: andere.id, project_id: projekt, storage_pfad: andere.pfad, dateiname: "Büro.pdf", erstellt_von: buero.id });
    expect((await mitgliedC.from("project_files").update({ archiviert_am: new Date().toISOString() }).eq("id", andere.id).select("id")).data ?? []).toEqual([]);
    expect((await bueroC.from("project_files").update({ archiviert_am: new Date().toISOString() }).eq("id", datei.id).select("id")).data).toHaveLength(1);
    await bueroC.from("project_files").delete().eq("id", datei.id);
    expect((await adminClient().from("project_files").select("id").eq("id", datei.id)).data).toHaveLength(1);
  });

  it("archivierte Projekte: die Dateien sind für alle Eingeloggten lesbar", async () => {
    const h = await hochladen(bueroC, archiviert);
    expect(h.error).toBeNull();
    await adminClient().from("project_files").insert({ id: h.id, project_id: archiviert, storage_pfad: h.pfad, dateiname: "Alt.pdf" });
    expect((await fremdC.from("project_files").select("id").eq("id", h.id)).data).toHaveLength(1);
    expect((await fremdC.storage.from("projektdateien").download(h.pfad)).error).toBeNull();
    expect((await anonClient().from("project_files").select("id").eq("id", h.id)).data ?? []).toEqual([]);
  });
});
