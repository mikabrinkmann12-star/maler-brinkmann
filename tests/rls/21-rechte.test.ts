// Rechte pro Rolle (Tabelle role_permissions, Migration …20261020180000_rechte):
//  * Voreinstellung = Verhalten vor der Einführung (die übrigen 270+ Rechte-Tests laufen mit der Voreinstellung und müssen unverändert grün bleiben),
//  * nur der Admin ändert die Rechte, ungültige Stufen lehnt die Datenbank ab,
//  * WEGNEHMEN: restriktive Regeln sperren Büro bzw. Mitarbeiter, der Admin bleibt unberührt,
//  * VERLEIHEN: Büro bekommt Admin-Rechte (Urlaub genehmigen, Kalkulation, Firmeneinstellungen), Mitarbeiter nie.
// Die Tests ändern die Rechte in dev und stellen nach jedem Test die Voreinstellung wieder her.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ALLE_RECHTE } from "@/lib/rechte";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let admin: TestNutzer, buero: TestNutzer, a: TestNutzer, b: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, aC: SupabaseClient;
let projekt: string, archiviert: string;
let kalkVorher: { zuschlaege: unknown; lohngruppen: unknown };

const tag = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Ein Dienstag ab in n Tagen (damit Urlaubsbuchungen nicht auf Wochenenden fallen). */
const dienstag = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

async function setze(rolle: "buero" | "mitarbeiter", recht: string, stufe: "nein" | "eigene" | "ja") {
  const r = await adminClient().from("role_permissions").update({ stufe }).eq("rolle", rolle).eq("recht", recht);
  expect(r.error).toBeNull();
}

async function standardWiederherstellen() {
  const zeilen = ALLE_RECHTE.flatMap((r) => [
    { rolle: "buero" as const, recht: r.schluessel, stufe: r.standard.buero },
    { rolle: "mitarbeiter" as const, recht: r.schluessel, stufe: r.standard.mitarbeiter },
  ]);
  const r = await adminClient().from("role_permissions").upsert(zeilen, { onConflict: "rolle,recht" });
  expect(r.error).toBeNull();
}

beforeAll(async () => {
  await standardWiederherstellen();
  [admin, buero, a, b] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, bueroC, aC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(a.benutzername, a.passwort),
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
  projekt = p!.find((x) => x.projektnummer.endsWith("P1"))!.id;
  archiviert = p!.find((x) => x.projektnummer.endsWith("P2"))!.id;
  await db.from("project_members").insert([{ project_id: projekt, user_id: a.id, added_by: buero.id }, { project_id: archiviert, user_id: b.id, added_by: buero.id }]);
  const { data: k } = await db.from("kalkulation_einstellungen").select("zuschlaege, lohngruppen").single();
  kalkVorher = k!;
});

afterEach(async () => {
  await standardWiederherstellen();
});

afterAll(async () => {
  const db = adminClient();
  await standardWiederherstellen();
  await db.from("kalkulation_einstellungen").update({ zuschlaege: kalkVorher.zuschlaege, lohngruppen: kalkVorher.lohngruppen }).eq("einzig", true);
  await db.from("kalkulation_einstellungen").update({ updated_by: null }).eq("einzig", true);
  await db.from("app_settings").delete().like("schluessel", `${kennung}%`);
  const alle = [admin.id, buero.id, a.id, b.id];
  await db.from("time_entries").delete().in("user_id", alle);
  await db.from("time_entries").delete().in("erstellt_von", alle);
  await db.from("time_entries").update({ bearbeitet_von: null }).in("bearbeitet_von", alle);
  await db.from("leave_requests").delete().in("user_id", [a.id, b.id]);
  await db.from("materials").delete().like("name", `${kennung}%`);
  await db.from("catalog_folders").delete().like("name", `${kennung}%`);
  await db.from("contacts").delete().like("firmenname", `${kennung}%`);
  await db.from("contacts").update({ created_by: null }).in("created_by", [admin.id, buero.id]);
  await db.from("project_notes").delete().in("project_id", [projekt, archiviert]);
  await db.from("project_messages").delete().in("project_id", [projekt, archiviert]);
  await db.from("project_members").delete().in("project_id", [projekt, archiviert]);
  await db.from("projects").delete().in("id", [projekt, archiviert]);
  await db.from("projects").update({ created_by: null }).in("created_by", [admin.id, buero.id]);
  await db.from("app_settings").update({ updated_by: null }).eq("updated_by", admin.id);
  await db.from("role_permissions").update({ updated_by: null }).in("updated_by", [admin.id, buero.id]);
  await Promise.all([admin, buero, a, b].map((n) => testNutzerLoeschen(n)));
});

// ---------------------------------------------------------------------------
describe("Tabelle role_permissions", () => {
  it("die Voreinstellung entspricht dem Katalog (alle Rechte, beide Rollen)", async () => {
    const { data } = await adminClient().from("role_permissions").select("rolle, recht, stufe");
    expect(data).toHaveLength(ALLE_RECHTE.length * 2);
    for (const r of ALLE_RECHTE) {
      expect(data!.find((z) => z.rolle === "buero" && z.recht === r.schluessel)?.stufe, `buero/${r.schluessel}`).toBe(r.standard.buero);
      expect(data!.find((z) => z.rolle === "mitarbeiter" && z.recht === r.schluessel)?.stufe, `mitarbeiter/${r.schluessel}`).toBe(r.standard.mitarbeiter);
    }
  });

  it("alle aktiven Nutzer lesen sie, geändert wird nur vom Admin", async () => {
    for (const c of [adminC, bueroC, aC]) expect((await c.from("role_permissions").select("id")).data?.length).toBeGreaterThan(0);
    for (const c of [bueroC, aC]) {
      const r = await c.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "buero").eq("recht", "urlaub_genehmigen").select("id");
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
      expect((await c.from("role_permissions").insert({ rolle: "buero", recht: "katalog", stufe: "ja" })).error).not.toBeNull();
    }
    const ok = await adminC.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "buero").eq("recht", "urlaub_genehmigen").select("id, updated_by");
    expect(ok.data).toHaveLength(1);
  });

  it("kein Löschen, auch nicht für den Admin", async () => {
    const r = await adminC.from("role_permissions").delete().eq("rolle", "buero").eq("recht", "katalog").select("id");
    expect(r.data ?? []).toEqual([]);
    expect((await adminClient().from("role_permissions").select("id").eq("rolle", "buero").eq("recht", "katalog")).data).toHaveLength(1);
  });

  it("die Datenbank lehnt Unsinn ab (Admin-Zeile, unbekanntes Recht, falsche Stufe)", async () => {
    const db = adminClient();
    expect((await db.from("role_permissions").insert({ rolle: "admin", recht: "katalog", stufe: "ja" })).error).not.toBeNull();
    expect((await db.from("role_permissions").insert({ rolle: "buero", recht: "gibt_es_nicht", stufe: "ja" })).error).not.toBeNull();
    expect((await db.from("role_permissions").update({ stufe: "vielleicht" }).eq("rolle", "buero").eq("recht", "katalog")).error).not.toBeNull();
    // Büro hat nie „eigene“
    expect((await db.from("role_permissions").update({ stufe: "eigene" }).eq("rolle", "buero").eq("recht", "katalog")).error).not.toBeNull();
  });

  it("Mitarbeiter können Admin-Rechte nie bekommen, auch nicht über direkten Datenbankzugriff", async () => {
    const db = adminClient();
    for (const recht of ["urlaub_genehmigen", "kalkulation_aendern", "einstellungen_firma", "kontakte_importieren", "katalog_importieren"]) {
      const r = await db.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "mitarbeiter").eq("recht", recht);
      expect(r.error, recht).not.toBeNull();
    }
  });

  it("jede Änderung steht im Protokoll", async () => {
    await adminC.from("role_permissions").update({ stufe: "nein" }).eq("rolle", "buero").eq("recht", "katalog");
    const { data: zeile } = await adminClient().from("role_permissions").select("id").eq("rolle", "buero").eq("recht", "katalog").single();
    const log = await adminClient().from("audit_log").select("aktion, geaendert_von").eq("tabelle", "role_permissions").eq("datensatz_id", zeile!.id).order("geaendert_am", { ascending: false }).limit(1);
    expect(log.data?.[0]).toMatchObject({ aktion: "UPDATE", geaendert_von: admin.id });
  });
});

// ---------------------------------------------------------------------------
describe("Büro: Rechte wegnehmen", () => {
  it("Katalog: ohne Recht weder lesen noch pflegen, der Admin behält alles", async () => {
    const { data: ordner } = await adminClient().from("catalog_folders").insert({ art: "material", name: `${kennung} Ordner` }).select("id").single();
    const ins = await bueroC.from("materials").insert({ folder_id: ordner!.id, name: `${kennung} M1`, einheit: "Stk", ek: 1 }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await bueroC.from("materials").select("id").eq("id", ins.data!.id)).data).toHaveLength(1);

    await setze("buero", "katalog", "nein");
    expect((await bueroC.from("materials").select("id").eq("id", ins.data!.id)).data ?? []).toEqual([]);
    expect((await bueroC.from("catalog_folders").select("id").eq("id", ordner!.id)).data ?? []).toEqual([]);
    expect((await bueroC.from("materials").insert({ folder_id: ordner!.id, name: `${kennung} M2`, einheit: "Stk", ek: 1 })).error).not.toBeNull();
    const aendern = await bueroC.from("materials").update({ ek: 5 }).eq("id", ins.data!.id).select("id");
    expect(aendern.data ?? []).toEqual([]);
    // Admin unberührt
    expect((await adminC.from("materials").select("id").eq("id", ins.data!.id)).data).toHaveLength(1);
    expect((await adminC.from("materials").update({ ek: 2 }).eq("id", ins.data!.id).select("id")).data).toHaveLength(1);
  });

  it("Projekte bearbeiten: ohne Recht kann das Büro weder anlegen noch ändern, aber weiter ansehen", async () => {
    await setze("buero", "projekte_bearbeiten", "nein");
    expect((await bueroC.from("projects").select("id").eq("id", projekt)).data).toHaveLength(1);
    const aendern = await bueroC.from("projects").update({ beschreibung: "x" }).eq("id", projekt).select("id");
    expect(aendern.data ?? []).toEqual([]);
    const { data: status } = await adminClient().from("project_statuses").select("id").eq("name", "In Arbeit").single();
    expect((await bueroC.from("projects").insert({ projektnummer: `${kennung}-NEU`, name: "x", status_id: status!.id })).error).not.toBeNull();
    expect((await adminC.from("projects").update({ beschreibung: "ok" }).eq("id", projekt).select("id")).data).toHaveLength(1);
  });

  it("Projekte ansehen: ohne Recht sieht das Büro keine Projekte und keine Inhalte", async () => {
    await adminClient().from("project_notes").insert({ project_id: projekt, text: "Notiz", erstellt_von: a.id });
    expect((await bueroC.from("project_notes").select("id").eq("project_id", projekt)).data?.length).toBe(1);
    await setze("buero", "projekte_ansehen", "nein");
    expect((await bueroC.from("projects").select("id").eq("id", projekt)).data ?? []).toEqual([]);
    expect((await bueroC.from("project_notes").select("id").eq("project_id", projekt)).data ?? []).toEqual([]);
    expect((await adminC.from("projects").select("id").eq("id", projekt)).data).toHaveLength(1);
  });

  it("Zeiten aller: ohne Recht sieht das Büro fremde Zeiten nicht, die eigenen schon", async () => {
    const zeitA = await aC.from("time_entries").insert({ user_id: a.id, datum: tag(-1), art: "sonstiges", stunden: 2, erstellt_von: a.id }).select("id").single();
    expect(zeitA.error).toBeNull();
    expect((await bueroC.from("time_entries").select("id").eq("id", zeitA.data!.id)).data).toHaveLength(1);
    await setze("buero", "zeiten_alle", "nein");
    expect((await bueroC.from("time_entries").select("id").eq("id", zeitA.data!.id)).data ?? []).toEqual([]);
    expect((await bueroC.from("time_entries").insert({ user_id: a.id, datum: tag(-2), art: "sonstiges", stunden: 1 })).error).not.toBeNull();
    const eigene = await bueroC.from("time_entries").insert({ user_id: buero.id, datum: tag(-2), art: "sonstiges", stunden: 1, erstellt_von: buero.id }).select("id").single();
    expect(eigene.error).toBeNull();
    expect((await bueroC.from("time_entries").select("id").eq("id", eigene.data!.id)).data).toHaveLength(1);
    expect((await adminC.from("time_entries").select("id").eq("id", zeitA.data!.id)).data).toHaveLength(1);
  });

  it("Kontakte bearbeiten: ohne Recht keine neuen Kontakte", async () => {
    expect((await bueroC.from("contacts").insert({ typ: "firma", firmenname: `${kennung} K1` })).error).toBeNull();
    await setze("buero", "kontakte_bearbeiten", "nein");
    expect((await bueroC.from("contacts").insert({ typ: "firma", firmenname: `${kennung} K2` })).error).not.toBeNull();
    expect((await adminC.from("contacts").insert({ typ: "firma", firmenname: `${kennung} K3` })).error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Mitarbeiter: Rechte wegnehmen", () => {
  it("Chat: ohne Recht weder lesen noch schreiben", async () => {
    expect((await aC.from("project_messages").insert({ project_id: projekt, text: "Hallo", erstellt_von: a.id })).error).toBeNull();
    await setze("mitarbeiter", "chat", "nein");
    expect((await aC.from("project_messages").select("id").eq("project_id", projekt)).data ?? []).toEqual([]);
    expect((await aC.from("project_messages").insert({ project_id: projekt, text: "Nochmal", erstellt_von: a.id })).error).not.toBeNull();
    // Büro ist nicht betroffen
    expect((await bueroC.from("project_messages").select("id").eq("project_id", projekt)).data?.length).toBe(1);
  });

  it("Projekte ansehen: ohne Recht sieht ein Mitglied sein Projekt nicht mehr", async () => {
    expect((await aC.from("projects").select("id").eq("id", projekt)).data).toHaveLength(1);
    await setze("mitarbeiter", "projekte_ansehen", "nein");
    expect((await aC.from("projects").select("id").eq("id", projekt)).data ?? []).toEqual([]);
    expect((await aC.from("project_members").select("project_id").eq("project_id", projekt)).data ?? []).toEqual([]);
  });

  it("Archiv ansehen: wer es nicht darf, sieht archivierte Projekte nicht, aktive eigene schon", async () => {
    // b ist nur im archivierten Projekt Mitglied, a nicht; beide dürfen das Archiv lesen
    expect((await aC.from("projects").select("id").eq("id", archiviert)).data).toHaveLength(1);
    await setze("mitarbeiter", "archiv_ansehen", "nein");
    expect((await aC.from("projects").select("id").eq("id", archiviert)).data ?? []).toEqual([]);
    expect((await aC.from("projects").select("id").eq("id", projekt)).data).toHaveLength(1);
  });

  it("Eintragen auf der Baustelle: ohne Recht keine Notizen", async () => {
    expect((await aC.from("project_notes").insert({ project_id: projekt, text: "Notiz 1", erstellt_von: a.id })).error).toBeNull();
    await setze("mitarbeiter", "baustelle_eintragen", "nein");
    expect((await aC.from("project_notes").insert({ project_id: projekt, text: "Notiz 2", erstellt_von: a.id })).error).not.toBeNull();
    // lesen darf er weiter (die Notiz des Admins aus einem anderen Test und seine eigene)
    expect((await aC.from("project_notes").select("id").eq("project_id", projekt)).data?.length).toBeGreaterThanOrEqual(1);
  });

  it("Eigene Zeiten: ohne Recht keine Zeit eintragen", async () => {
    expect((await aC.from("time_entries").insert({ user_id: a.id, datum: tag(-1), art: "sonstiges", stunden: 1, erstellt_von: a.id })).error).toBeNull();
    await setze("mitarbeiter", "zeiten_eigene", "nein");
    expect((await aC.from("time_entries").insert({ user_id: a.id, datum: tag(-1), art: "sonstiges", stunden: 2, erstellt_von: a.id })).error).not.toBeNull();
    expect((await aC.from("time_entries").select("id").eq("user_id", a.id)).data ?? []).toEqual([]);
  });

  it("Urlaub beantragen: ohne Recht kein Antrag", async () => {
    await setze("mitarbeiter", "urlaub_beantragen", "nein");
    expect((await aC.from("leave_requests").insert({ von: tag(30), bis: tag(31) })).error).not.toBeNull();
  });

  it("Kollegen hinzufügen: ohne Recht kann ein Mitarbeiter niemanden zum Projekt holen", async () => {
    await setze("mitarbeiter", "kollegen_hinzufuegen", "nein");
    const r = await aC.from("project_members").insert({ project_id: projekt, user_id: b.id, added_by: a.id });
    expect(r.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Büro: Rechte verleihen", () => {
  async function antrag(): Promise<string> {
    const { data } = await adminClient().from("leave_requests").insert({ user_id: a.id, von: dienstag(40), bis: dienstag(40) }).select("id").single();
    return data!.id;
  }

  it("Urlaub genehmigen: erst mit dem Recht, Entscheider wird festgehalten", async () => {
    const id = await antrag();
    const ohne = await bueroC.from("leave_requests").update({ status: "genehmigt" }).eq("id", id).select("id");
    expect(ohne.data ?? []).toEqual([]);

    await setze("buero", "urlaub_genehmigen", "ja");
    const mit = await bueroC.from("leave_requests").update({ status: "genehmigt", antwort: "Viel Spaß" }).eq("id", id).select("id, status, entschieden_von");
    expect(mit.error).toBeNull();
    expect(mit.data?.[0]).toMatchObject({ status: "genehmigt", entschieden_von: buero.id });
    // Die Buchung der Urlaubstage läuft mit (Trigger), der Mitarbeiter sieht sie
    const gebucht = await aC.from("time_entries").select("id").eq("leave_request_id", id);
    expect(gebucht.data?.length ?? 0).toBeGreaterThan(0);
    // Mitarbeiter können sich das Recht nicht selbst nehmen
    const selbst = await aC.from("leave_requests").update({ status: "abgelehnt" }).eq("id", id).select("id");
    expect(selbst.error !== null || (selbst.data ?? []).length === 0).toBe(true);
  });

  it("Urlaub genehmigen: wird das Recht wieder genommen, geht es nicht mehr", async () => {
    const id = await antrag();
    await setze("buero", "urlaub_genehmigen", "ja");
    await setze("buero", "urlaub_genehmigen", "nein");
    const r = await bueroC.from("leave_requests").update({ status: "genehmigt" }).eq("id", id).select("id");
    expect(r.data ?? []).toEqual([]);
  });

  it("Kalkulation ändern: erst mit dem Recht", async () => {
    const neu = { material: 41, geraete: 6, fremdleistung: 1, sonstiges: 4 };
    expect((await bueroC.from("kalkulation_einstellungen").update({ zuschlaege: neu }).eq("einzig", true).select("id")).data ?? []).toEqual([]);
    await setze("buero", "kalkulation_aendern", "ja");
    expect((await bueroC.from("kalkulation_einstellungen").update({ zuschlaege: neu }).eq("einzig", true).select("id")).data).toHaveLength(1);
    // Ansehen ohne das Ansehen-Recht geht mit dem Änderungsrecht weiter
    await setze("buero", "kalkulation_ansehen", "nein");
    expect((await bueroC.from("kalkulation_einstellungen").select("id")).data).toHaveLength(1);
    // Mitarbeiter bleiben draußen
    expect((await aC.from("kalkulation_einstellungen").select("id")).data ?? []).toEqual([]);
  });

  it("Firmeneinstellungen: erst mit dem Recht, Mitarbeiter nie", async () => {
    const schluessel = `${kennung}-einst`;
    expect((await bueroC.from("app_settings").insert({ schluessel, wert: { x: 1 } })).error).not.toBeNull();
    await setze("buero", "einstellungen_firma", "ja");
    expect((await bueroC.from("app_settings").insert({ schluessel, wert: { x: 1 } })).error).toBeNull();
    expect((await bueroC.from("app_settings").update({ wert: { x: 2 } }).eq("schluessel", schluessel).select("schluessel")).data).toHaveLength(1);
    expect((await aC.from("app_settings").update({ wert: { x: 3 } }).eq("schluessel", schluessel).select("schluessel")).data ?? []).toEqual([]);
    const status = await bueroC.from("project_statuses").insert({ name: `${kennung} Status`, farbe: "#112233", sortierung: 999 }).select("id").single();
    expect(status.error).toBeNull();
    await adminClient().from("project_statuses").delete().eq("id", status.data!.id);
  });

  it("Das Recht „Rechte ändern“ gibt es nicht: Büro kann role_permissions auch mit allen Rechten nie ändern", async () => {
    for (const r of ALLE_RECHTE.filter((x) => x.verleih)) await setze("buero", r.schluessel, "ja");
    const r = await bueroC.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "buero").eq("recht", "katalog").select("id");
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    expect((await bueroC.from("profiles").update({ rolle: "admin" }).eq("id", buero.id).select("id")).data ?? []).toEqual([]);
  });
});
