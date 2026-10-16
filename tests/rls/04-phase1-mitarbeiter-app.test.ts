// Phase 1: Kollegen hinzufügen, Einteilung, Zeiten (Sperrfrist), Urlaub,
// Notizen/Material/Aufmaß/Fotos, Benachrichtigungen, Einstellungen.
// Arbeitet mit eigenen Wegwerf-Daten (TEST-…), räumt am Ende alles auf.
import { randomBytes, randomUUID } from "node:crypto";
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

const kennung = `TEST-${randomBytes(3).toString("hex")}`;

/** Heutiges Datum in Deutschland als JJJJ-MM-TT, verschoben um n Tage. */
function tag(verschiebung = 0): string {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + verschiebung);
  return d.toISOString().slice(0, 10);
}

let admin: TestNutzer, buero: TestNutzer, malerA: TestNutzer, malerB: TestNutzer, malerC: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient, cC: SupabaseClient;
let p1: string; // malerA ist Mitglied
let p2: string; // malerB ist Mitglied
let fahrzeug: string;
const fotoPfade: string[] = [];

beforeAll(async () => {
  [admin, buero, malerA, malerB, malerC] = await Promise.all([
    testNutzerAnlegen("admin"),
    testNutzerAnlegen("buero"),
    testNutzerAnlegen("mitarbeiter"),
    testNutzerAnlegen("mitarbeiter"),
    testNutzerAnlegen("mitarbeiter"),
  ]);
  [adminC, bueroC, aC, bC, cC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(malerA.benutzername, malerA.passwort),
    einloggen(malerB.benutzername, malerB.passwort),
    einloggen(malerC.benutzername, malerC.passwort),
  ]);

  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
  const { data: projekte } = await db
    .from("projects")
    .insert([
      { projektnummer: `${kennung}-P1`, name: `${kennung} Baustelle 1`, status_id: status!.id },
      { projektnummer: `${kennung}-P2`, name: `${kennung} Baustelle 2`, status_id: status!.id },
    ])
    .select("id, projektnummer");
  p1 = projekte!.find((p) => p.projektnummer.endsWith("P1"))!.id;
  p2 = projekte!.find((p) => p.projektnummer.endsWith("P2"))!.id;
  await db.from("project_members").insert([
    { project_id: p1, user_id: malerA.id, added_by: buero.id },
    { project_id: p2, user_id: malerB.id, added_by: buero.id },
  ]);
  const { data: auto } = await db.from("vehicles").insert({ name: `${kennung} Auto` }).select("id").single();
  fahrzeug = auto!.id;
});

afterAll(async () => {
  const db = adminClient();
  const nutzer = [admin, buero, malerA, malerB, malerC].filter(Boolean).map((n) => n.id);
  if (fotoPfade.length) await db.storage.from("projektfotos").remove(fotoPfade);
  const projekte = [p1, p2].filter(Boolean);
  for (const tabelle of ["project_photos", "project_notes", "material_usage", "measurements", "time_entries"] as const) {
    await db.from(tabelle).delete().in("project_id", projekte);
  }
  await db.from("time_entries").delete().in("user_id", nutzer);
  await db.from("leave_requests").delete().in("user_id", nutzer);
  await db.from("notifications").delete().in("ausgeloest_von", nutzer);
  await db.from("notifications").delete().in("project_id", projekte);
  await db.from("assignments").delete().in("project_id", projekte);
  await db.from("project_members").delete().in("project_id", projekte);
  await db.from("projects").delete().in("id", projekte);
  if (fahrzeug) await db.from("vehicles").delete().eq("id", fahrzeug);
  await Promise.all([admin, buero, malerA, malerB, malerC].map(testNutzerLoeschen));
});

// ---------------------------------------------------------------------------
describe("Kollegen zur Baustelle hinzufügen (Kernfeature)", () => {
  it("ein Mitarbeiter kann einen Kollegen zu SEINEM Projekt hinzufügen – der sieht es sofort", async () => {
    const { error } = await aC
      .from("project_members")
      .insert({ project_id: p1, user_id: malerC.id, added_by: malerA.id });
    expect(error).toBeNull();
    const { data } = await cC.from("projects").select("id").eq("id", p1);
    expect(data).toEqual([{ id: p1 }]);
  });

  it("das Büro bekommt eine Benachrichtigung, Mitarbeiter sehen keine", async () => {
    const { data } = await bueroC
      .from("notifications")
      .select("typ, text, ausgeloest_von")
      .eq("project_id", p1);
    expect(data).toEqual([
      expect.objectContaining({ typ: "kollege_hinzugefuegt", ausgeloest_von: malerA.id }),
    ]);
    expect(data![0].text).toContain("hinzugefügt");
    const mitarbeiter = await aC.from("notifications").select("id");
    expect(mitarbeiter.data ?? []).toEqual([]);
  });

  it("zu fremden Projekten kann ein Mitarbeiter niemanden hinzufügen", async () => {
    const { error } = await aC
      .from("project_members")
      .insert({ project_id: p2, user_id: malerC.id, added_by: malerA.id });
    expect(error).not.toBeNull();
  });

  it("ein Mitarbeiter kann nicht vortäuschen, das Büro zu sein (added_by)", async () => {
    const { error } = await aC
      .from("project_members")
      .insert({ project_id: p1, user_id: malerB.id, added_by: buero.id });
    expect(error).not.toBeNull();
  });

  it("nur Büro/Admin können die Zuordnung wieder entfernen", async () => {
    const maler = await aC.from("project_members").delete()
      .eq("project_id", p1).eq("user_id", malerC.id).select("user_id");
    expect(maler.data ?? []).toEqual([]);
    const bueroWeg = await bueroC.from("project_members").delete()
      .eq("project_id", p1).eq("user_id", malerC.id).select("user_id");
    expect(bueroWeg.data?.length).toBe(1);
    const sicht = await cC.from("projects").select("id").eq("id", p1);
    expect(sicht.data ?? []).toEqual([]);
  });

  it("kollegen() liefert Namen für Eingeloggte, nicht ohne Login", async () => {
    const { data, error } = await aC.rpc("kollegen");
    expect(error).toBeNull();
    expect((data as { id: string }[]).map((k) => k.id)).toEqual(
      expect.arrayContaining([malerB.id, malerC.id]),
    );
    const anon = await anonClient().rpc("kollegen");
    expect(anon.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Einteilung (Tageseinsatz)", () => {
  let einsatz: string;

  it("das Büro teilt ein – der Mitarbeiter wird automatisch Projektmitglied", async () => {
    const { data, error } = await bueroC
      .from("assignments")
      .insert({ datum: tag(), vehicle_id: fahrzeug, project_id: p2, notiz: "Leiter mitnehmen" })
      .select("id")
      .single();
    expect(error).toBeNull();
    einsatz = data!.id;
    const mitglied = await bueroC.from("assignment_members")
      .insert([{ assignment_id: einsatz, user_id: malerA.id }, { assignment_id: einsatz, user_id: malerB.id }]);
    expect(mitglied.error).toBeNull();

    const sicht = await aC.from("projects").select("id").eq("id", p2);
    expect(sicht.data).toEqual([{ id: p2 }]);
  });

  it("der Mitarbeiter sieht seinen Einsatz samt Kollegen, andere sehen ihn nicht", async () => {
    const eigener = await aC.from("assignments").select("id, notiz").eq("id", einsatz);
    expect(eigener.data).toEqual([{ id: einsatz, notiz: "Leiter mitnehmen" }]);
    const team = await aC.from("assignment_members").select("user_id").eq("assignment_id", einsatz);
    expect(team.data?.map((t) => t.user_id).sort()).toEqual([malerA.id, malerB.id].sort());
    const fremd = await cC.from("assignments").select("id").eq("id", einsatz);
    expect(fremd.data ?? []).toEqual([]);
  });

  it("Mitarbeiter können nicht einteilen", async () => {
    const { error } = await aC.from("assignments").insert({ datum: tag(), project_id: p1 });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Zeiten", () => {
  let eintragA: string;
  let eintragFuerB: string;

  it("berechnet die Stunden: 6:30–15:45 mit 45 Min Pause = 8,5 Std", async () => {
    const { data, error } = await aC
      .from("time_entries")
      .insert({ user_id: malerA.id, project_id: p1, datum: tag(), von: "06:30", bis: "15:45", pause_min: 45, stunden: 0 })
      .select("id, stunden, erstellt_von")
      .single();
    expect(error).toBeNull();
    expect(Number(data!.stunden)).toBe(8.5);
    expect(data!.erstellt_von).toBe(malerA.id);
    eintragA = data!.id;
  });

  it("Ende vor Beginn wird abgelehnt", async () => {
    const { error } = await aC
      .from("time_entries")
      .insert({ user_id: malerA.id, project_id: p1, datum: tag(), von: "15:00", bis: "07:00", stunden: 0 });
    expect(error?.code).toBe("P0001");
  });

  it("für einen Kollegen derselben Baustelle mit eintragen geht, der sieht es", async () => {
    const { data, error } = await aC
      .from("time_entries")
      .insert({ user_id: malerB.id, project_id: p2, datum: tag(), von: "06:30", bis: "15:45", pause_min: 45, stunden: 0 })
      .select("id")
      .single();
    expect(error).toBeNull();
    eintragFuerB = data!.id;
    const sicht = await bC.from("time_entries").select("id, erstellt_von").eq("id", eintragFuerB);
    expect(sicht.data).toEqual([{ id: eintragFuerB, erstellt_von: malerA.id }]);
  });

  it("für jemanden, der nicht auf der Baustelle ist, geht es nicht", async () => {
    const { error } = await aC
      .from("time_entries")
      .insert({ user_id: malerC.id, project_id: p2, datum: tag(), von: "07:00", bis: "15:00", stunden: 0 });
    expect(error).not.toBeNull();
  });

  it("auf fremden Baustellen kann man keine Zeit eintragen", async () => {
    const { error } = await cC
      .from("time_entries")
      .insert({ user_id: malerC.id, project_id: p1, datum: tag(), von: "07:00", bis: "15:00", stunden: 0 });
    expect(error).not.toBeNull();
  });

  it("nicht erlaubte Arten (z. B. Krank) darf nur das Büro eintragen", async () => {
    const maler = await aC.from("time_entries")
      .insert({ user_id: malerA.id, datum: tag(), art: "krank", stunden: 8.5 });
    expect(maler.error).not.toBeNull();
    const bueroEintrag = await bueroC.from("time_entries")
      .insert({ user_id: malerA.id, datum: tag(-1), art: "krank", stunden: 8.5 }).select("id").single();
    expect(bueroEintrag.error).toBeNull();
  });

  it("Tage vor der Sperrfrist kann nur das Büro eintragen", async () => {
    const alt = tag(-60);
    const maler = await aC.from("time_entries")
      .insert({ user_id: malerA.id, project_id: p1, datum: alt, von: "07:00", bis: "15:00", stunden: 0 });
    expect(maler.error).not.toBeNull();
    const bueroEintrag = await bueroC.from("time_entries")
      .insert({ user_id: malerA.id, project_id: p1, datum: alt, von: "07:00", bis: "15:00", stunden: 0 });
    expect(bueroEintrag.error).toBeNull();
  });

  it("Zukunft geht für Mitarbeiter nicht", async () => {
    const { error } = await aC.from("time_entries")
      .insert({ user_id: malerA.id, project_id: p1, datum: tag(1), von: "07:00", bis: "15:00", stunden: 0 });
    expect(error).not.toBeNull();
  });

  it("man sieht eigene und selbst eingetragene Zeiten, andere nicht; das Büro alle", async () => {
    const a = await aC.from("time_entries").select("id").in("id", [eintragA, eintragFuerB]);
    expect(a.data?.length).toBe(2); // eigener + der für Kollege B eingetragene
    const b = await bC.from("time_entries").select("id").in("id", [eintragA, eintragFuerB]);
    expect(b.data).toEqual([{ id: eintragFuerB }]); // B sieht A's eigenen Eintrag nicht
    const c = await cC.from("time_entries").select("id").in("id", [eintragA, eintragFuerB]);
    expect(c.data ?? []).toEqual([]);
    const buero = await bueroC.from("time_entries").select("id").in("id", [eintragA, eintragFuerB]);
    expect(buero.data?.length).toBe(2);
  });

  it("eigene Zeiten ändern geht, fremde nicht, und umschreiben auf jemand anderen auch nicht", async () => {
    const eigen = await aC.from("time_entries").update({ beschreibung: "Wände gestrichen" })
      .eq("id", eintragA).select("id, bearbeitet_von");
    expect(eigen.data).toEqual([{ id: eintragA, bearbeitet_von: malerA.id }]);
    const fremd = await aC.from("time_entries").update({ beschreibung: "fremd" })
      .eq("id", eintragFuerB).select("id");
    expect(fremd.data ?? []).toEqual([]);
    const umschreiben = await aC.from("time_entries").update({ user_id: malerB.id })
      .eq("id", eintragA).select("id");
    expect(umschreiben.error !== null || (umschreiben.data ?? []).length === 0).toBe(true);
  });

  it("mehrere Einträge auf einmal (ich + Kollege) mit vorab erzeugten IDs – nochmal senden speichert nichts doppelt", async () => {
    const ids = [randomUUID(), randomUUID()];
    const zeilen = [malerA.id, malerB.id].map((user_id, i) => ({
      id: ids[i], user_id, erstellt_von: malerA.id, project_id: p2, datum: tag(), von: "16:00", bis: "17:00", stunden: 1,
    }));
    expect((await aC.from("time_entries").insert(zeilen)).error).toBeNull();
    const nochmal = await aC.from("time_entries").insert(zeilen);
    expect(nochmal.error?.code).toBe("23505");
    const sicht = await aC.from("time_entries").select("id").in("id", ids);
    expect(sicht.data?.length).toBe(2);

    // eigene Zeit „löschen“ = archivieren geht innerhalb der Sperrfrist
    const archiv = await aC.from("time_entries").update({ archiviert_am: new Date().toISOString() })
      .eq("id", ids[0]).select("id");
    expect(archiv.data).toEqual([{ id: ids[0] }]);
  });

  it("ist ein Kollege nicht auf der Baustelle, wird gar nichts gespeichert (alles oder nichts)", async () => {
    const ids = [randomUUID(), randomUUID()];
    const zeilen = [malerA.id, malerC.id].map((user_id, i) => ({
      id: ids[i], user_id, erstellt_von: malerA.id, project_id: p2, datum: tag(), von: "17:00", bis: "18:00", stunden: 1,
    }));
    expect((await aC.from("time_entries").insert(zeilen)).error).not.toBeNull();
    const sicht = await bueroC.from("time_entries").select("id").in("id", ids);
    expect(sicht.data ?? []).toEqual([]);
  });

  it("Zeiten kann niemand löschen (archivieren statt löschen)", async () => {
    for (const client of [aC, bueroC, adminC]) {
      const { data } = await client.from("time_entries").delete().eq("id", eintragA).select("id");
      expect(data ?? []).toEqual([]);
    }
  });

  it("Sperrfrist: laufender Monat + Kulanz bis zum 3., nie Zukunft", async () => {
    const pruefe = async (datum: string, heute: string) =>
      (await aC.rpc("zeit_noch_aenderbar", { p_datum: datum, p_heute: heute })).data;
    expect(await pruefe("2026-11-01", "2026-11-20")).toBe(true);
    expect(await pruefe("2026-10-31", "2026-11-03")).toBe(true);
    expect(await pruefe("2026-10-31", "2026-11-04")).toBe(false);
    expect(await pruefe("2026-10-01", "2026-11-02")).toBe(true);
    expect(await pruefe("2026-09-30", "2026-11-02")).toBe(false);
    expect(await pruefe("2026-11-21", "2026-11-20")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("Einstellungen", () => {
  it("alle lesen die Zeiterfassungs-Einstellungen, nur der Admin ändert sie", async () => {
    const lesen = await aC.from("app_settings").select("wert").eq("schluessel", "zeiterfassung").single();
    expect(lesen.data?.wert).toMatchObject({ standard_beginn: "06:30", standard_pause_min: 45, kulanz_tage: 3 });
    const wert = lesen.data!.wert;

    const bueroAenderung = await bueroC.from("app_settings").update({ wert }).eq("schluessel", "zeiterfassung").select("schluessel");
    expect(bueroAenderung.data ?? []).toEqual([]);
    const adminAenderung = await adminC.from("app_settings").update({ wert }).eq("schluessel", "zeiterfassung").select("schluessel");
    expect(adminAenderung.data?.length).toBe(1);

    // So speichert die Einstellungsseite (upsert): Büro nein, Admin ja
    const bueroUpsert = await bueroC.from("app_settings").upsert({ schluessel: "zeiterfassung", wert });
    expect(bueroUpsert.error).not.toBeNull();
    const adminUpsert = await adminC.from("app_settings").upsert({ schluessel: "zeiterfassung", wert, updated_by: admin.id });
    expect(adminUpsert.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Urlaubsanträge", () => {
  let antrag: string;

  it("Mitarbeiter stellen einen Antrag, das Büro wird benachrichtigt", async () => {
    const { data, error } = await aC.from("leave_requests")
      .insert({ von: tag(30), bis: tag(34), bemerkung: "Familienurlaub" })
      .select("id, status, user_id").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "offen", user_id: malerA.id });
    antrag = data!.id;
    const hinweis = await bueroC.from("notifications").select("typ").eq("typ", "urlaubsantrag").eq("ausgeloest_von", malerA.id);
    expect(hinweis.data?.length).toBe(1);
  });

  it("niemand kann einen Antrag direkt als genehmigt anlegen oder sich selbst genehmigen", async () => {
    const direkt = await aC.from("leave_requests").insert({ von: tag(40), bis: tag(41), status: "genehmigt" });
    expect(direkt.error).not.toBeNull();
    const selbst = await aC.from("leave_requests").update({ status: "genehmigt" }).eq("id", antrag).select("id");
    expect(selbst.error !== null || (selbst.data ?? []).length === 0).toBe(true);
  });

  it("andere Mitarbeiter sehen den Antrag nicht, das Büro schon – aber es darf nicht entscheiden", async () => {
    const b = await bC.from("leave_requests").select("id").eq("id", antrag);
    expect(b.data ?? []).toEqual([]);
    const sicht = await bueroC.from("leave_requests").select("id").eq("id", antrag);
    expect(sicht.data?.length).toBe(1);
    const entscheiden = await bueroC.from("leave_requests").update({ status: "genehmigt" }).eq("id", antrag).select("id");
    expect(entscheiden.data ?? []).toEqual([]);
  });

  it("der Admin genehmigt – Entscheider und Zeitpunkt werden festgehalten", async () => {
    const { data, error } = await adminC.from("leave_requests")
      .update({ status: "genehmigt", antwort: "Viel Spaß!" }).eq("id", antrag)
      .select("status, entschieden_von, entschieden_am").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "genehmigt", entschieden_von: admin.id });
    expect(data!.entschieden_am).toBeTruthy();
  });

  it("nach der Entscheidung kann der Mitarbeiter den Antrag nicht mehr ändern", async () => {
    const { data } = await aC.from("leave_requests").update({ status: "zurueckgezogen" }).eq("id", antrag).select("id");
    expect(data ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("Notizen, Material, Aufmaß", () => {
  let notiz: string;

  it("Projektmitglieder können anlegen und lesen, Fremde nicht", async () => {
    const n = await aC.from("project_notes").insert({ project_id: p1, text: "Schlüssel beim Nachbarn" }).select("id").single();
    expect(n.error).toBeNull();
    notiz = n.data!.id;
    const m = await aC.from("material_usage").insert({ project_id: p1, material: "Dispersionsfarbe weiß", menge: 2, einheit: "Eimer" });
    expect(m.error).toBeNull();
    const a = await aC.from("measurements")
      .insert({ project_id: p1, raum: "Wohnzimmer", position: "Wand Nord", laenge: 4.5, hoehe: 2.5, menge: 11.25 })
      .select("id").single();
    expect(a.error).toBeNull();
    const abzug = await aC.from("measurement_deductions")
      .insert({ measurement_id: a.data!.id, bezeichnung: "Fenster", breite: 1.2, hoehe: 1.4 });
    expect(abzug.error).toBeNull();

    for (const tabelle of ["project_notes", "material_usage", "measurements"] as const) {
      const fremd = await cC.from(tabelle).select("id").eq("project_id", p1);
      expect(fremd.data ?? [], tabelle).toEqual([]);
    }
    const fremdAbzug = await cC.from("measurement_deductions").select("id").eq("measurement_id", a.data!.id);
    expect(fremdAbzug.data ?? []).toEqual([]);
    const fremdAnlegen = await cC.from("project_notes").insert({ project_id: p1, text: "darf nicht" });
    expect(fremdAnlegen.error).not.toBeNull();
  });

  it("Notizen kann niemand löschen, nur archivieren", async () => {
    for (const client of [aC, bueroC]) {
      const { data } = await client.from("project_notes").delete().eq("id", notiz).select("id");
      expect(data ?? []).toEqual([]);
    }
    const archiv = await aC.from("project_notes").update({ archiviert_am: new Date().toISOString() }).eq("id", notiz).select("id");
    expect(archiv.data?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("Fotos (privater Speicher)", () => {
  const bild = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  it("Projektmitglieder laden hoch und sehen das Foto, Fremde nicht", async () => {
    const pfad = `${p1}/${kennung}.jpg`;
    fotoPfade.push(pfad);
    const hoch = await aC.storage.from("projektfotos").upload(pfad, bild, { contentType: "image/jpeg" });
    expect(hoch.error).toBeNull();
    const zeile = await aC.from("project_photos").insert({ project_id: p1, storage_pfad: pfad, kategorie: "vorher" });
    expect(zeile.error).toBeNull();

    const eigen = await aC.storage.from("projektfotos").download(pfad);
    expect(eigen.error).toBeNull();
    const fremd = await cC.storage.from("projektfotos").download(pfad);
    expect(fremd.error).not.toBeNull();
    const ohneLogin = await anonClient().storage.from("projektfotos").download(pfad);
    expect(ohneLogin.error).not.toBeNull();
  });

  it("in fremde Projektordner kann niemand hochladen", async () => {
    const pfad = `${p1}/${kennung}-fremd.jpg`;
    const { error } = await cC.storage.from("projektfotos").upload(pfad, bild, { contentType: "image/jpeg" });
    if (!error) fotoPfade.push(pfad);
    expect(error).not.toBeNull();
  });

  it("Fotos kann ein Mitarbeiter nicht löschen", async () => {
    const { data } = await aC.storage.from("projektfotos").remove([`${p1}/${kennung}.jpg`]);
    expect(data ?? []).toEqual([]);
    const nochDa = await adminClient().storage.from("projektfotos").download(`${p1}/${kennung}.jpg`);
    expect(nochDa.error).toBeNull();
  });
});
