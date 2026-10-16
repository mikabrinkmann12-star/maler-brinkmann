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
  await db.from("assignment_stops").delete().in("project_id", projekte);
  if (fahrzeug) await db.from("assignments").delete().eq("vehicle_id", fahrzeug);
  await db.from("assignments").delete().in("created_by", nutzer);
  await db.from("appointments").delete().in("erstellt_von", nutzer);
  await db.from("appointments").delete().in("project_id", projekte);
  await db.from("project_members").delete().in("project_id", projekte);
  await db.from("projects").delete().in("id", projekte);
  await db.from("contacts").delete().like("kundennummer", `${kennung}%`);
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
      .insert({ datum: tag(), vehicle_id: fahrzeug, notiz: "Leiter mitnehmen" })
      .select("id")
      .single();
    expect(error).toBeNull();
    einsatz = data!.id;
    const stopp = await bueroC.from("assignment_stops").insert({ assignment_id: einsatz, project_id: p2 });
    expect(stopp.error).toBeNull();
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
    const { error } = await aC.from("assignments").insert({ datum: tag() });
    expect(error).not.toBeNull();
    const stopp = await aC.from("assignment_stops").insert({ assignment_id: einsatz, project_id: p1 });
    expect(stopp.error).not.toBeNull();
  });

  it("ein Auto fährt mehrere Baustellen an: alle im Team werden Mitglied aller Baustellen, mit Zeit", async () => {
    // zweite Baustelle p1 mit „kann ab 13:00“ – malerB ist dort noch kein Mitglied
    const vorher = await bC.from("projects").select("id").eq("id", p1);
    expect(vorher.data ?? []).toEqual([]);
    const stopp = await bueroC.from("assignment_stops")
      .insert({ assignment_id: einsatz, project_id: p1, sortierung: 1, zeit: "13:00", zeit_art: "ab", notiz: "Ausmessen" });
    expect(stopp.error).toBeNull();
    const nachher = await bC.from("projects").select("id").eq("id", p1);
    expect(nachher.data).toEqual([{ id: p1 }]);

    // Mitarbeiter sehen beide Stopps ihres Einsatzes, Fremde keinen
    const meine = await bC.from("assignment_stops").select("project_id, zeit, zeit_art").eq("assignment_id", einsatz).order("sortierung");
    expect(meine.data).toEqual([
      { project_id: p2, zeit: null, zeit_art: null },
      { project_id: p1, zeit: "13:00:00", zeit_art: "ab" },
    ]);
    const fremd = await cC.from("assignment_stops").select("id").eq("assignment_id", einsatz);
    expect(fremd.data ?? []).toEqual([]);
  });

  it("Zeit und Art gehören zusammen, dieselbe Baustelle nur einmal pro Auto", async () => {
    const halb = await bueroC.from("assignment_stops").insert({ assignment_id: einsatz, project_id: p2, zeit: "09:00" });
    expect(halb.error).not.toBeNull();
    const doppelt = await bueroC.from("assignment_stops").insert({ assignment_id: einsatz, project_id: p1 });
    expect(doppelt.error?.code).toBe("23505");
  });

  it("wer später ins Team kommt, wird ebenfalls Mitglied aller Stopps", async () => {
    await bueroC.from("assignment_members").insert({ assignment_id: einsatz, user_id: malerC.id });
    const c = await cC.from("projects").select("id").in("id", [p1, p2]);
    expect(c.data?.map((p) => p.id).sort()).toEqual([p1, p2].sort());
    // Aufräumen: C ist für die folgenden Tests wieder „fremd“
    await bueroC.from("assignment_members").delete().eq("assignment_id", einsatz).eq("user_id", malerC.id);
    await bueroC.from("project_members").delete().eq("user_id", malerC.id).in("project_id", [p1, p2]);
    const danach = await cC.from("projects").select("id").in("id", [p1, p2]);
    expect(danach.data ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("Termine (Kalender)", () => {
  const termin = randomUUID();
  const buerotermin = randomUUID();

  it("ein Mitarbeiter trägt einen eigenen Termin ein, das Büro bekommt einen Hinweis", async () => {
    const neu = await aC.from("appointments")
      .insert({ id: termin, datum: tag(3), titel: "Zu von Garrel", ort: "Garrel", erstellt_von: malerA.id });
    expect(neu.error).toBeNull();
    const ich = await aC.from("appointment_members").insert({ appointment_id: termin, user_id: malerA.id });
    expect(ich.error).toBeNull();
    const hinweis = await bueroC.from("notifications").select("typ, text").eq("typ", "termin").eq("ausgeloest_von", malerA.id);
    expect(hinweis.data?.length).toBe(1);
    expect(hinweis.data![0].text).toContain("Zu von Garrel");
  });

  it("Mitarbeiter tragen keine Kollegen ein und sehen fremde Termine nicht, das Büro sieht alle", async () => {
    const kollege = await aC.from("appointment_members").insert({ appointment_id: termin, user_id: malerB.id });
    expect(kollege.error).not.toBeNull();
    const fremd = await bC.from("appointments").select("id").eq("id", termin);
    expect(fremd.data ?? []).toEqual([]);
    const buero = await bueroC.from("appointments").select("id").eq("id", termin);
    expect(buero.data?.length).toBe(1);
  });

  it("das Büro trägt für einen Mitarbeiter ein – der sieht den Termin, kann ihn aber nicht ändern", async () => {
    const neu = await bueroC.from("appointments").insert({ id: buerotermin, datum: tag(4), titel: "Lieferung Farbe", project_id: p1, erstellt_von: buero.id });
    expect(neu.error).toBeNull();
    const m = await bueroC.from("appointment_members").insert([{ appointment_id: buerotermin, user_id: malerB.id }]);
    expect(m.error).toBeNull();
    const sicht = await bC.from("appointments").select("id, titel").eq("id", buerotermin);
    expect(sicht.data).toEqual([{ id: buerotermin, titel: "Lieferung Farbe" }]);
    const aendern = await bC.from("appointments").update({ titel: "geändert" }).eq("id", buerotermin).select("id");
    expect(aendern.data ?? []).toEqual([]);
    // Büro legt keine Hinweise an (nur Mitarbeiter-Termine lösen aus)
    const hinweise = await bueroC.from("notifications").select("id").eq("typ", "termin").eq("ausgeloest_von", buero.id);
    expect(hinweise.data ?? []).toEqual([]);
  });

  it("eigene Termine ändern und archivieren geht, fremde nicht; löschen niemand", async () => {
    const eigen = await aC.from("appointments").update({ titel: "Zu von Garrel (später)" }).eq("id", termin).select("id");
    expect(eigen.data).toEqual([{ id: termin }]);
    const fremd = await cC.from("appointments").update({ archiviert_am: new Date().toISOString() }).eq("id", termin).select("id");
    expect(fremd.data ?? []).toEqual([]);
    for (const client of [aC, bueroC, adminC]) {
      const { data } = await client.from("appointments").delete().eq("id", termin).select("id");
      expect(data ?? []).toEqual([]);
    }
    const archiv = await aC.from("appointments").update({ archiviert_am: new Date().toISOString() }).eq("id", termin).select("id");
    expect(archiv.data).toEqual([{ id: termin }]);
  });

  it("auf fremde Baustellen kann ein Mitarbeiter keinen Termin legen", async () => {
    const db = adminClient();
    const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
    const { data: fremdProjekt } = await db.from("projects")
      .insert({ projektnummer: `${kennung}-P3`, name: `${kennung} Fremde Baustelle`, status_id: status!.id }).select("id").single();
    const { error } = await aC.from("appointments")
      .insert({ id: randomUUID(), datum: tag(5), titel: "x", project_id: fremdProjekt!.id, erstellt_von: malerA.id });
    expect(error).not.toBeNull();
    await db.from("projects").delete().eq("id", fremdProjekt!.id);
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

  it("Zeiten derselben Person dürfen sich nie überlappen – egal wer einträgt; direkt anschließen geht", async () => {
    // B hat heute schon 06:30–15:45 (von A eingetragen) und 16:00–17:00
    const ueberlappt = await bC.from("time_entries")
      .insert({ user_id: malerB.id, project_id: p2, datum: tag(), von: "15:00", bis: "16:00", stunden: 0 });
    expect(ueberlappt.error?.code).toBe("23P01");
    const anschluss = await bC.from("time_entries")
      .insert({ user_id: malerB.id, project_id: p2, datum: tag(), von: "15:45", bis: "16:00", stunden: 0 });
    expect(anschluss.error).toBeNull();
    // Archivierte Einträge zählen nicht (A's 16:00–17:00 wurde oben archiviert)
    const nachArchiv = await aC.from("time_entries")
      .insert({ user_id: malerA.id, project_id: p2, datum: tag(), von: "16:00", bis: "17:00", stunden: 0 });
    expect(nachArchiv.error).toBeNull();
    // Mitarbeiter dürfen Zeiten nicht selbst mit einem Urlaubsantrag verknüpfen
    const { data: fremderAntrag } = await adminClient().from("leave_requests")
      .insert({ user_id: malerC.id, von: tag(90), bis: tag(90) }).select("id").single();
    const verknuepft = await aC.from("time_entries")
      .insert({ user_id: malerA.id, datum: tag(), art: "sonstiges", stunden: 1, leave_request_id: fremderAntrag!.id });
    expect(verknuepft.error?.code).toBe("P0001");
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

  it("genehmigter Urlaub wird je Werktag als Zeit gebucht (Mo–Do 8,5 Std, Fr 6 Std)", async () => {
    const { data } = await aC.from("time_entries")
      .select("datum, art, stunden, leave_request_id").eq("leave_request_id", antrag).is("archiviert_am", null).order("datum");
    const erwartet: { datum: string; stunden: number }[] = [];
    for (let i = 30; i <= 34; i++) {
      const wochentag = new Date(`${tag(i)}T12:00:00Z`).getUTCDay();
      if (wochentag !== 0 && wochentag !== 6) erwartet.push({ datum: tag(i), stunden: wochentag === 5 ? 6 : 8.5 });
    }
    expect((data ?? []).map((t) => ({ datum: t.datum, stunden: Number(t.stunden) }))).toEqual(erwartet);
    expect(data?.every((t) => t.art === "urlaub")).toBe(true);
  });

  it("nimmt der Admin die Genehmigung zurück, werden die gebuchten Tage archiviert", async () => {
    const { error } = await adminC.from("leave_requests").update({ status: "abgelehnt" }).eq("id", antrag);
    expect(error).toBeNull();
    const { data } = await aC.from("time_entries").select("id").eq("leave_request_id", antrag).is("archiviert_am", null);
    expect(data ?? []).toEqual([]);
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

  it("Aufmaß wie die App: unsichtbar anlegen, Abzüge dazu, freischalten – Kollegen ändern es nicht", async () => {
    const id = randomUUID();
    const neu = await aC.from("measurements").insert({
      id, project_id: p2, raum: "Flur", position: "Wände streichen", laenge: 5, hoehe: 2.6, menge: 8.6,
      erstellt_von: malerA.id, archiviert_am: new Date().toISOString(),
    });
    expect(neu.error).toBeNull();
    const abzug = await aC.from("measurement_deductions").insert({ measurement_id: id, bezeichnung: "Tür", breite: 2, hoehe: 2.2 });
    expect(abzug.error).toBeNull();
    const frei = await aC.from("measurements").update({ archiviert_am: null }).eq("id", id).select("id");
    expect(frei.data).toEqual([{ id }]);

    // malerB ist auch auf p2, darf A's Aufmaß aber weder ändern noch Abzüge anhängen
    const fremd = await bC.from("measurements").update({ archiviert_am: new Date().toISOString() }).eq("id", id).select("id");
    expect(fremd.data ?? []).toEqual([]);
    const fremdAbzug = await bC.from("measurement_deductions").insert({ measurement_id: id, bezeichnung: "x", breite: 1, hoehe: 1 });
    expect(fremdAbzug.error).not.toBeNull();
    const buero = await bueroC.from("measurements").update({ archiviert_am: new Date().toISOString() }).eq("id", id).select("id");
    expect(buero.data).toEqual([{ id }]);
  });

  it("Material: nur das Büro hakt ab, Kollegen können fremde Meldungen nicht ändern", async () => {
    const { data: m } = await aC.from("material_usage")
      .insert({ id: randomUUID(), project_id: p2, material: "Abdeckvlies", menge: 1, einheit: "Rolle", erstellt_von: malerA.id })
      .select("id").single();
    const kollege = await bC.from("material_usage").update({ erledigt_am: new Date().toISOString() }).eq("id", m!.id).select("id");
    expect(kollege.data ?? []).toEqual([]);
    const buero = await bueroC.from("material_usage").update({ erledigt_am: new Date().toISOString() }).eq("id", m!.id).select("id");
    expect(buero.data).toEqual([{ id: m!.id }]);
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

// ---------------------------------------------------------------------------
describe("Kontakte (Zahlung, Steuer, Rechte)", () => {
  it("das Büro legt einen Kontakt mit Zahlungsziel, Skonto und Steuersatz an", async () => {
    const { data, error } = await bueroC.from("contacts").insert({
      kundennummer: `${kennung}-K1`, typ: "privat", nachname: "Muster", website: "www.example.com",
      zahlungsziel_tage: 14, skonto_prozent: 2.5, skonto_tage: 7, steuersatz: 7,
    }).select("id, steuersatz").single();
    expect(error).toBeNull();
    expect(Number(data!.steuersatz)).toBe(7);
  });

  it("Steuersatz nur 0/7/19, Skonto nur mit Prozent und Tagen, Kundennummer eindeutig", async () => {
    const basis = { typ: "privat", nachname: "Muster" };
    expect((await bueroC.from("contacts").insert({ ...basis, kundennummer: `${kennung}-K2`, steuersatz: 16 })).error).not.toBeNull();
    expect((await bueroC.from("contacts").insert({ ...basis, kundennummer: `${kennung}-K3`, skonto_prozent: 2 })).error).not.toBeNull();
    expect((await bueroC.from("contacts").insert({ ...basis, kundennummer: `${kennung}-K1` })).error?.code).toBe("23505");
  });

  it("Mitarbeiter können keine Kontakte anlegen, das Büro sieht und archiviert sie", async () => {
    expect((await aC.from("contacts").insert({ typ: "privat", nachname: "X", kundennummer: `${kennung}-K4` })).error).not.toBeNull();
    const archiv = await bueroC.from("contacts").update({ archiviert_am: new Date().toISOString() })
      .eq("kundennummer", `${kennung}-K1`).select("id");
    expect(archiv.data?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("Fahrzeuge anlegen", () => {
  it("Büro und Admin legen ein Auto an, Mitarbeiter nicht; Kennzeichen ist eindeutig", async () => {
    const kz = `TST-${kennung.slice(-4).toUpperCase()}`;
    const buero1 = await bueroC.from("vehicles").insert({ name: kz, kennzeichen: kz }).select("id").single();
    expect(buero1.error).toBeNull();
    const doppelt = await adminC.from("vehicles").insert({ name: `${kz} zwei`, kennzeichen: kz });
    expect(doppelt.error?.code).toBe("23505");
    expect((await aC.from("vehicles").insert({ name: "x", kennzeichen: `${kz}-M` })).error).not.toBeNull();
    // Büro darf ändern (deaktivieren), Mitarbeiter nicht
    const aus = await bueroC.from("vehicles").update({ aktiv: false }).eq("id", buero1.data!.id).select("id");
    expect(aus.data).toEqual([{ id: buero1.data!.id }]);
    const maler = await aC.from("vehicles").update({ aktiv: true }).eq("id", buero1.data!.id).select("id");
    expect(maler.data ?? []).toEqual([]);
    await adminClient().from("vehicles").delete().eq("id", buero1.data!.id);
  });
});
