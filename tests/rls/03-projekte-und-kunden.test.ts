// Projekte, Kunden, Mitglieder, Fahrzeuge, Status:
// Wer sieht was, wer darf anlegen/ändern, und niemand darf löschen.
// Arbeitet mit eigenen Wegwerf-Daten (Präfix TEST-), nicht mit den Demo-Daten.
import { randomBytes } from "node:crypto";
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

let admin: TestNutzer;
let buero: TestNutzer;
let maler: TestNutzer;
let adminC: SupabaseClient;
let bueroC: SupabaseClient;
let malerC: SupabaseClient;

let statusId: string;
let kundeEigen: string; // Kunde des Projekts, auf dem der Maler steht
let kundeFremd: string;
let projektEigen: string; // Maler ist Mitglied
let projektFremd: string; // Maler ist NICHT Mitglied
const spaeterAufraeumen = { projekte: [] as string[], kunden: [] as string[], fahrzeuge: [] as string[], status: [] as string[] };

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([
    testNutzerAnlegen("admin"),
    testNutzerAnlegen("buero"),
    testNutzerAnlegen("mitarbeiter"),
  ]);
  adminC = await einloggen(admin.benutzername, admin.passwort);
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  malerC = await einloggen(maler.benutzername, maler.passwort);

  // Testdaten mit dem Server-Schlüssel anlegen (umgeht RLS)
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
  statusId = status!.id;

  const { data: kunden } = await db
    .from("contacts")
    .insert([
      { kundennummer: `${kennung}-K1`, typ: "privat", nachname: "Eigen" },
      { kundennummer: `${kennung}-K2`, typ: "privat", nachname: "Fremd" },
    ])
    .select("id, kundennummer");
  kundeEigen = kunden!.find((k) => k.kundennummer.endsWith("K1"))!.id;
  kundeFremd = kunden!.find((k) => k.kundennummer.endsWith("K2"))!.id;
  spaeterAufraeumen.kunden.push(kundeEigen, kundeFremd);

  const { data: projekte } = await db
    .from("projects")
    .insert([
      { projektnummer: `${kennung}-P1`, name: "Eigenes Projekt", contact_id: kundeEigen, status_id: statusId },
      { projektnummer: `${kennung}-P2`, name: "Fremdes Projekt", contact_id: kundeFremd, status_id: statusId },
    ])
    .select("id, projektnummer");
  projektEigen = projekte!.find((p) => p.projektnummer.endsWith("P1"))!.id;
  projektFremd = projekte!.find((p) => p.projektnummer.endsWith("P2"))!.id;
  spaeterAufraeumen.projekte.push(projektEigen, projektFremd);

  await db.from("project_members").insert({ project_id: projektEigen, user_id: maler.id, added_by: buero.id });
  await db.from("project_members").insert({ project_id: projektFremd, user_id: buero.id, added_by: buero.id });
});

afterAll(async () => {
  const db = adminClient();
  const { projekte, kunden, fahrzeuge, status } = spaeterAufraeumen;
  if (projekte.length) {
    await db.from("notifications").delete().in("project_id", projekte);
    await db.from("project_members").delete().in("project_id", projekte);
    await db.from("projects").delete().in("id", projekte);
  }
  if (kunden.length) await db.from("contacts").delete().in("id", kunden);
  if (fahrzeuge.length) await db.from("vehicles").delete().in("id", fahrzeuge);
  if (status.length) await db.from("project_statuses").delete().in("id", status);
  await Promise.all([admin, buero, maler].map(testNutzerLoeschen));
});

describe("Ein Maler …", () => {
  it("sieht nur Projekte, auf denen er eingetragen ist", async () => {
    const { data } = await malerC.from("projects").select("id").in("id", [projektEigen, projektFremd]);
    expect(data).toEqual([{ id: projektEigen }]);
  });

  it("sieht ein fremdes Projekt auch nicht, wenn er gezielt danach fragt", async () => {
    const { data } = await malerC.from("projects").select("id").eq("id", projektFremd);
    expect(data ?? []).toEqual([]);
  });

  it("sieht nur den Kunden seines Projekts", async () => {
    const { data } = await malerC.from("contacts").select("id").in("id", [kundeEigen, kundeFremd]);
    expect(data).toEqual([{ id: kundeEigen }]);
  });

  it("sieht die Mitglieder nur von seinen eigenen Projekten", async () => {
    const { data } = await malerC
      .from("project_members")
      .select("project_id")
      .in("project_id", [projektEigen, projektFremd]);
    expect((data ?? []).every((m) => m.project_id === projektEigen)).toBe(true);
    expect(data?.length).toBe(1);
  });

  it("kann keine Projekte oder Kunden anlegen", async () => {
    const projekt = await malerC
      .from("projects")
      .insert({ projektnummer: `${kennung}-X`, name: "Darf nicht", status_id: statusId });
    expect(projekt.error).not.toBeNull();
    const kunde = await malerC.from("contacts").insert({ kundennummer: `${kennung}-X`, nachname: "Darf nicht" });
    expect(kunde.error).not.toBeNull();
  });

  it("kann sein eigenes Projekt nicht ändern", async () => {
    const { data } = await malerC
      .from("projects")
      .update({ name: "Umbenannt vom Maler" })
      .eq("id", projektEigen)
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("kann zu fremden Projekten niemanden hinzufügen (eigene: siehe Test 04)", async () => {
    const { error } = await malerC
      .from("project_members")
      .insert({ project_id: projektFremd, user_id: maler.id, added_by: maler.id });
    expect(error).not.toBeNull();
  });

  it("sieht das Änderungsprotokoll nicht", async () => {
    const { data } = await malerC.from("audit_log").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("darf Status und Fahrzeuge lesen, aber nicht anlegen", async () => {
    const lesen = await malerC.from("project_statuses").select("id").eq("id", statusId);
    expect(lesen.data).toEqual([{ id: statusId }]);
    const anlegen = await malerC.from("vehicles").insert({ name: `${kennung} Maler-Auto` });
    expect(anlegen.error).not.toBeNull();
  });
});

describe("Das Büro …", () => {
  it("sieht alle Projekte und Kunden", async () => {
    const projekte = await bueroC.from("projects").select("id").in("id", [projektEigen, projektFremd]);
    expect(projekte.data?.length).toBe(2);
    const kunden = await bueroC.from("contacts").select("id").in("id", [kundeEigen, kundeFremd]);
    expect(kunden.data?.length).toBe(2);
  });

  it("kann Kunden und Projekte anlegen und ändern; das Protokoll zeigt wer", async () => {
    const kunde = await bueroC
      .from("contacts")
      .insert({ kundennummer: `${kennung}-K3`, typ: "firma", firmenname: "Büro-Kunde GmbH" })
      .select("id")
      .single();
    expect(kunde.error).toBeNull();
    spaeterAufraeumen.kunden.push(kunde.data!.id);

    const projekt = await bueroC
      .from("projects")
      .insert({ projektnummer: `${kennung}-P3`, name: "Büro-Projekt", contact_id: kunde.data!.id, status_id: statusId })
      .select("id")
      .single();
    expect(projekt.error).toBeNull();
    spaeterAufraeumen.projekte.push(projekt.data!.id);

    const aenderung = await bueroC
      .from("projects")
      .update({ beschreibung: "Geändert vom Büro" })
      .eq("id", projekt.data!.id)
      .select("id");
    expect(aenderung.data?.length).toBe(1);

    const { data: protokoll } = await adminClient()
      .from("audit_log")
      .select("aktion, geaendert_von")
      .eq("tabelle", "projects")
      .eq("datensatz_id", projekt.data!.id);
    expect(protokoll).toEqual(
      expect.arrayContaining([
        { aktion: "INSERT", geaendert_von: buero.id },
        { aktion: "UPDATE", geaendert_von: buero.id },
      ]),
    );
  });

  it("kann Mitglieder hinzufügen und entfernen", async () => {
    const hinzu = await bueroC
      .from("project_members")
      .insert({ project_id: projektFremd, user_id: maler.id, added_by: buero.id });
    expect(hinzu.error).toBeNull();
    // Jetzt sieht der Maler das Projekt sofort
    const sicht = await malerC.from("projects").select("id").eq("id", projektFremd);
    expect(sicht.data).toEqual([{ id: projektFremd }]);

    const weg = await bueroC
      .from("project_members")
      .delete()
      .eq("project_id", projektFremd)
      .eq("user_id", maler.id)
      .select("user_id");
    expect(weg.data?.length).toBe(1);
    const danach = await malerC.from("projects").select("id").eq("id", projektFremd);
    expect(danach.data ?? []).toEqual([]);
  });

  it("kann beim Hinzufügen nicht vortäuschen, jemand anderes zu sein (added_by)", async () => {
    const { error } = await bueroC
      .from("project_members")
      .insert({ project_id: projektFremd, user_id: maler.id, added_by: admin.id });
    expect(error).not.toBeNull();
  });

  it("darf Fahrzeuge anlegen (seit 16.10.2026), Status aber nicht (nur Admin)", async () => {
    const fahrzeug = await bueroC.from("vehicles").insert({ name: `${kennung} Büro-Auto` }).select("id").single();
    expect(fahrzeug.error).toBeNull();
    spaeterAufraeumen.fahrzeuge.push(fahrzeug.data!.id);
    const status = await bueroC.from("project_statuses").insert({ name: `${kennung} Büro-Status` });
    expect(status.error).not.toBeNull();
  });
});

describe("Der Admin …", () => {
  it("darf Fahrzeuge und Status anlegen", async () => {
    const fahrzeug = await adminC.from("vehicles").insert({ name: `${kennung} Admin-Auto` }).select("id").single();
    expect(fahrzeug.error).toBeNull();
    spaeterAufraeumen.fahrzeuge.push(fahrzeug.data!.id);

    const status = await adminC
      .from("project_statuses")
      .insert({ name: `${kennung} Admin-Status`, farbe: "#123456" })
      .select("id")
      .single();
    expect(status.error).toBeNull();
    spaeterAufraeumen.status.push(status.data!.id);
  });
});

describe("Löschen ist für niemanden erlaubt (archivieren statt löschen)", () => {
  it("weder Büro noch Admin können Projekte oder Kunden löschen", async () => {
    for (const client of [bueroC, adminC]) {
      const projekt = await client.from("projects").delete().eq("id", projektFremd).select("id");
      expect(projekt.data ?? []).toEqual([]);
      const kunde = await client.from("contacts").delete().eq("id", kundeFremd).select("id");
      expect(kunde.data ?? []).toEqual([]);
    }
    const { data } = await adminClient().from("projects").select("id").eq("id", projektFremd);
    expect(data).toEqual([{ id: projektFremd }]);
  });

  it("das Änderungsprotokoll kann niemand ändern oder leeren", async () => {
    const aendern = await adminC.from("audit_log").update({ aktion: "DELETE" }).eq("tabelle", "projects").select("id");
    expect(aendern.error !== null || (aendern.data ?? []).length === 0).toBe(true);
    const loeschen = await adminC.from("audit_log").delete().eq("tabelle", "projects").select("id");
    expect(loeschen.error !== null || (loeschen.data ?? []).length === 0).toBe(true);
  });
});

describe("Ohne Login …", () => {
  it("sieht man keine Projekte, Kunden, Mitglieder, Status, Fahrzeuge oder Protokolle", async () => {
    const anon = anonClient();
    for (const tabelle of ["projects", "contacts", "project_members", "project_statuses", "vehicles", "audit_log"]) {
      const { data } = await anon.from(tabelle).select("*").limit(1);
      expect(data ?? [], tabelle).toEqual([]);
    }
  });
});
