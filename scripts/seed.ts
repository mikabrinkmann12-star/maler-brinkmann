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
import { FAHRZEUGE, KUNDEN, NUTZER, PROJEKTE, SEED_PRAEFIX } from "./seed-daten";

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

  if (alteProjektIds.length) {
    pruefe("Mitglieder entfernen", await db.from("project_members").delete().in("project_id", alteProjektIds));
  }
  if (alteNutzerIds.length) {
    pruefe("Mitgliedschaften entfernen", await db.from("project_members").delete().in("user_id", alteNutzerIds));
    pruefe("Hinzugefügt-von entfernen", await db.from("project_members").delete().in("added_by", alteNutzerIds));
  }
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
  pruefe("Fahrzeuge anlegen", await db.from("vehicles").insert(FAHRZEUGE));

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

  // --- Zusammenfassung ---------------------------------------------------------
  console.log(`
✔ Fertig: ${NUTZER.length} Zugänge, ${FAHRZEUGE.length} Fahrzeuge, ${KUNDEN.length} Kunden, ${PROJEKTE.length} Projekte.

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
