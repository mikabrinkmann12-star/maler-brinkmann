// Testdaten für brinkmann-dev anlegen:  npm run seed
//
// - Läuft NUR mit APP_ENV=development in .env.local (nie gegen Live!).
// - Kann beliebig oft laufen: räumt zuerst die eigenen alten Testdaten weg
//   (erkennbar an den Präfixen in seed-daten.ts) und legt alles neu an.
// - Andere Daten (z. B. Mikas Admin-Zugang) werden nicht angefasst.
// - Alle Demo-Zugänge bekommen dasselbe Passwort: SEED_PASSWORT aus .env.local.
//   Fehlt es, wird eins erzeugt und in .env.local eingetragen.

import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { MIN_PASSWORT_LAENGE } from "../src/lib/login";
import { nutzerAnlegen } from "../src/lib/nutzer";
import { startpasswortErzeugen } from "../src/lib/passwort";
import type { Database } from "../src/lib/supabase/database.types";
import { heuteIso } from "../src/lib/datum";
import { EINSAETZE_HEUTE, FAHRZEUGE, KUNDEN, NUTZER, PROJEKTE, SEED_PRAEFIX } from "./seed-daten";

const ENV_DATEI = ".env.local";
process.loadEnvFile(ENV_DATEI);

function env(name: string): string {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt in ${ENV_DATEI}`);
  return wert;
}

/** Datum relativ zu heute als JJJJ-MM-TT (für date-Spalten). */
function tageAbHeute(tage: number | undefined): string | null {
  if (tage === undefined) return null;
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Wirft bei Datenbankfehlern mit verständlicher Meldung.
 * Ohne Fehler sind die Daten einer Abfrage mit .select() nie null.
 */
function pruefe<T>(
  schritt: string,
  ergebnis: { data: T | null; error: { message: string } | null },
): NonNullable<T> {
  if (ergebnis.error) throw new Error(`${schritt}: ${ergebnis.error.message}`);
  return ergebnis.data as NonNullable<T>;
}

function seedPasswort(): string {
  const vorhanden = process.env.SEED_PASSWORT;
  if (vorhanden) {
    if (vorhanden.length < MIN_PASSWORT_LAENGE) {
      throw new Error(`SEED_PASSWORT muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen haben.`);
    }
    return vorhanden;
  }
  const neu = startpasswortErzeugen();
  appendFileSync(
    ENV_DATEI,
    `\n# Passwort aller Demo-Zugänge (npm run seed)\nSEED_PASSWORT=${neu}\n`,
  );
  console.log(`  Neues SEED_PASSWORT erzeugt und in ${ENV_DATEI} eingetragen.`);
  return neu;
}

async function main() {
  // --- Sicherheitsbremse ---------------------------------------------------
  if (process.env.APP_ENV !== "development") {
    throw new Error(
      "Abbruch: Testdaten nur mit APP_ENV=development (brinkmann-dev). Niemals gegen Live!",
    );
  }
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`\nTestdaten für: ${url}\n`);

  const db = createClient<Database>(url, env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const passwort = seedPasswort();

  // --- 1. Alte Testdaten wegräumen ------------------------------------------
  console.log("1. Alte Testdaten entfernen …");
  const alteNutzer = pruefe(
    "Demo-Nutzer lesen",
    await db.from("profiles").select("id").like("benutzername", `${SEED_PRAEFIX.benutzer}%`),
  );
  const alteNutzerIds = alteNutzer.map((n) => n.id);
  const alteProjekte = pruefe(
    "Demo-Projekte lesen",
    await db.from("projects").select("id").like("projektnummer", `${SEED_PRAEFIX.projekt}%`),
  );
  const alteProjektIds = alteProjekte.map((p) => p.id);

  const alteFahrzeuge = pruefe(
    "Demo-Fahrzeuge lesen",
    await db.from("vehicles").select("id").like("kennzeichen", `${SEED_PRAEFIX.kennzeichen}%`),
  );
  const alteFahrzeugIds = alteFahrzeuge.map((f) => f.id);

  // Löscht alle Zeilen einer Tabelle, deren Spalte auf alte Demo-Daten zeigt.
  const entferne = async (
    tabelle: "assignments" | "assignment_members" | "time_entries" | "leave_requests" | "notifications"
      | "project_notes" | "project_photos" | "material_usage" | "measurements" | "project_members" | "appointments"
      | "appointment_members" | "project_messages" | "chat_reads" | "project_files" | "project_reports" | "incoming_invoices",
    spalte: string,
    ids: string[],
  ) => {
    if (!ids.length) return;
    pruefe(`${tabelle} (${spalte}) entfernen`, await db.from(tabelle).delete().in(spalte, ids));
  };

  // Fotos im Speicher (Ordner = Projekt-ID)
  for (const projektId of alteProjektIds) {
    const { data: dateien } = await db.storage.from("projektfotos").list(projektId, { limit: 1000 });
    if (dateien?.length) {
      await db.storage.from("projektfotos").remove(dateien.map((d) => `${projektId}/${d.name}`));
    }
  }
  // Alles, was an Demo-Projekten, -Fahrzeugen oder -Nutzern hängt (Phase 1)
  // Stopps der Einsätze (zeigen auf Demo-Projekte); die Einsätze selbst gehen über Auto bzw. Ersteller weg
  pruefe("assignment_stops entfernen", await db.from("assignment_stops").delete().in("project_id", alteProjektIds.length ? alteProjektIds : ["00000000-0000-0000-0000-000000000000"]));
  await entferne("appointments", "project_id", alteProjektIds);
  await entferne("appointments", "erstellt_von", alteNutzerIds);
  await entferne("assignments", "vehicle_id", alteFahrzeugIds);
  await entferne("assignments", "created_by", alteNutzerIds);
  await entferne("assignment_members", "user_id", alteNutzerIds);
  await entferne("appointment_members", "user_id", alteNutzerIds);
  for (const spalte of ["project_id", "user_id", "erstellt_von", "bearbeitet_von"]) {
    await entferne("time_entries", spalte, spalte === "project_id" ? alteProjektIds : alteNutzerIds);
  }
  await entferne("leave_requests", "user_id", alteNutzerIds);
  await entferne("leave_requests", "entschieden_von", alteNutzerIds);
  await entferne("notifications", "project_id", alteProjektIds);
  await entferne("notifications", "ausgeloest_von", alteNutzerIds);
  // Eingangsrechnungen, die Demo-Projekten zugewiesen oder von Demo-Nutzern angelegt wurden
  await entferne("incoming_invoices", "project_id", alteProjektIds);
  await entferne("incoming_invoices", "erstellt_von", alteNutzerIds);
  await entferne("incoming_invoices", "bearbeitet_von", alteNutzerIds);
  // Berichte und Chat zuerst (Nachrichten verweisen auf Fotos und Dateien der Ablage)
  await entferne("project_reports", "project_id", alteProjektIds);
  await entferne("project_reports", "erstellt_von", alteNutzerIds);
  await entferne("project_messages", "project_id", alteProjektIds);
  await entferne("project_messages", "erstellt_von", alteNutzerIds);
  await entferne("chat_reads", "project_id", alteProjektIds);
  await entferne("chat_reads", "user_id", alteNutzerIds);
  for (const tabelle of ["project_files", "project_notes", "project_photos", "material_usage", "measurements"] as const) {
    await entferne(tabelle, "project_id", alteProjektIds);
    await entferne(tabelle, "erstellt_von", alteNutzerIds);
  }
  if (alteNutzerIds.length) {
    await db.from("app_settings").update({ updated_by: null }).in("updated_by", alteNutzerIds);
  }

  await entferne("project_members", "project_id", alteProjektIds);
  await entferne("project_members", "user_id", alteNutzerIds);
  await entferne("project_members", "added_by", alteNutzerIds);
  if (alteProjektIds.length) {
    pruefe("Projekte entfernen", await db.from("projects").delete().in("id", alteProjektIds));
  }
  pruefe("Kunden entfernen", await db.from("contacts").delete().like("kundennummer", `${SEED_PRAEFIX.kunde}%`));
  pruefe("Fahrzeuge entfernen", await db.from("vehicles").delete().like("kennzeichen", `${SEED_PRAEFIX.kennzeichen}%`));
  for (const id of alteNutzerIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`Demo-Nutzer löschen: ${error.message}`);
  }
  console.log(`   ${alteNutzerIds.length} Nutzer, ${alteProjektIds.length} Projekte entfernt.`);

  // --- 2. Nutzer ---------------------------------------------------------------
  console.log("2. Demo-Zugänge anlegen …");
  const nutzerIds = new Map<string, string>();
  for (const n of NUTZER) {
    const id = await nutzerAnlegen(db, env("LOGIN_EMAIL_DOMAIN"), {
      benutzername: n.benutzername,
      vorname: n.vorname,
      nachname: n.nachname,
      rolle: n.rolle,
      telefon: n.telefon,
      passwort,
      mussPasswortAendern: n.passwortwechsel ?? false,
    });
    nutzerIds.set(n.benutzername, id);
  }

  // --- 3. Fahrzeuge ------------------------------------------------------------
  console.log("3. Fahrzeuge anlegen …");
  const fahrzeuge = pruefe(
    "Fahrzeuge anlegen",
    await db.from("vehicles").insert(FAHRZEUGE).select("id, kennzeichen"),
  );
  const fahrzeugNach = new Map(fahrzeuge.map((f) => [f.kennzeichen, f.id]));

  // --- 4. Kunden ---------------------------------------------------------------
  console.log("4. Kunden anlegen …");
  const kunden = pruefe(
    "Kunden anlegen",
    await db
      .from("contacts")
      .insert(
        KUNDEN.map((k, i) => ({
          ...k,
          telefon: `040 66969 ${200 + i}`,
          email: `kunde-${k.kundennummer.toLowerCase()}@example.com`,
        })),
      )
      .select("id, kundennummer, strasse, plz, ort"),
  );
  const kundeNach = new Map(kunden.map((k) => [k.kundennummer, k]));

  // --- 5. Projekte + Mitglieder --------------------------------------------
  console.log("5. Projekte anlegen …");
  const statusse = pruefe("Status lesen", await db.from("project_statuses").select("id, name"));
  const statusId = new Map(statusse.map((s) => [s.name, s.id]));
  const bueroId = nutzerIds.get("demo-buero")!;
  const projektNach = new Map<string, string>();

  for (const p of PROJEKTE) {
    const kunde = kundeNach.get(p.kunde);
    const status = statusId.get(p.status);
    if (!kunde) throw new Error(`Kunde ${p.kunde} fehlt (Projekt ${p.projektnummer})`);
    if (!status) throw new Error(`Status "${p.status}" fehlt in project_statuses`);
    const baustelle = p.baustelle ?? { strasse: kunde.strasse, plz: kunde.plz, ort: kunde.ort };

    const projekt = pruefe<{ id: string }>(
      `Projekt ${p.projektnummer}`,
      await db
        .from("projects")
        .insert({
          projektnummer: p.projektnummer,
          name: p.name,
          contact_id: kunde.id,
          baustelle_strasse: baustelle.strasse,
          baustelle_plz: baustelle.plz,
          baustelle_ort: baustelle.ort,
          status_id: status,
          start_datum: tageAbHeute(p.von),
          end_datum: tageAbHeute(p.bis),
          beschreibung: p.beschreibung,
          buero_ansprechpartner_id: bueroId,
          archiviert_am: p.archiviert ? new Date().toISOString() : null,
        })
        .select("id")
        .single(),
    );
    projektNach.set(p.projektnummer, projekt.id);

    if (p.mitglieder.length) {
      pruefe(
        `Mitglieder ${p.projektnummer}`,
        await db.from("project_members").insert(
          p.mitglieder.map((name) => ({
            project_id: projekt.id,
            user_id: nutzerIds.get(name)!,
            added_by: bueroId,
          })),
        ),
      );
    }
  }

  // --- 6. Einteilung für heute (für die Seite „Heute“) -------------------------
  console.log("6. Einteilung für heute anlegen …");
  const heute = heuteIso();
  for (const e of EINSAETZE_HEUTE) {
    const einsatz = pruefe<{ id: string }>(
      `Einsatz ${e.kennzeichen}`,
      await db
        .from("assignments")
        .insert({
          datum: heute,
          vehicle_id: fahrzeugNach.get(e.kennzeichen)!,
          notiz: e.notiz ?? null,
          created_by: bueroId,
        })
        .select("id")
        .single(),
    );
    const stopps = [{ projekt: e.projekt }, ...(e.weitereStopps ?? [])];
    pruefe(
      `Stopps ${e.kennzeichen}`,
      await db.from("assignment_stops").insert(
        stopps.map((s, i) => ({
          assignment_id: einsatz.id,
          project_id: projektNach.get(s.projekt)!,
          sortierung: i,
          zeit: "zeit" in s && s.zeit ? s.zeit : null,
          zeit_art: "zeitArt" in s && s.zeitArt ? s.zeitArt : null,
          notiz: "notiz" in s && s.notiz ? s.notiz : null,
        })),
      ),
    );
    pruefe(
      `Team ${e.kennzeichen}`,
      await db
        .from("assignment_members")
        .insert(e.mitarbeiter.map((name) => ({ assignment_id: einsatz.id, user_id: nutzerIds.get(name)! }))),
    );
  }

  // --- Zusammenfassung ---------------------------------------------------------
  console.log(`
✔ Fertig: ${NUTZER.length} Zugänge, ${FAHRZEUGE.length} Fahrzeuge, ${KUNDEN.length} Kunden, ${PROJEKTE.length} Projekte, ${EINSAETZE_HEUTE.length} Einsätze für heute.

Demo-Zugänge (Passwort für alle: SEED_PASSWORT in ${ENV_DATEI}):`);
  for (const n of NUTZER) {
    const projekte = PROJEKTE.filter((p) => p.mitglieder.includes(n.benutzername)).length;
    const info = n.rolle === "mitarbeiter" ? `${projekte} Projekt(e)` : "";
    const wechsel = n.passwortwechsel ? " · muss Passwort ändern" : "";
    console.log(`  ${n.benutzername.padEnd(16)} ${n.rolle.padEnd(12)} ${info}${wechsel}`);
  }
}

main().catch((fehler: unknown) => {
  console.error(`\n✘ ${fehler instanceof Error ? fehler.message : String(fehler)}`);
  process.exit(1);
});
