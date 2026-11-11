// Eigenes Backup (kostenlos, bis Supabase Pro gebucht ist): alle Tabellen als JSON, die Nutzerliste und alle Dateien
// (Fotos, Rechnungs-PDFs, Logo …) in einen Ordner auf diesem PC. Liest nur, ändert nichts.
//
//   npm run backup                 → sichert brinkmann-live (.env.live)
//   npm run backup -- .env.local   → sichert brinkmann-dev
//
// Ziel: Ordner BACKUP_ORDNER (in der Env-Datei, sonst Desktop\APP-Backups), darin <Projekt>\<Datum_Uhrzeit>\.
// Es bleiben die letzten 12 Sicherungen je Projekt, ältere werden gelöscht. Anleitung: docs/BACKUP.md
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envDatei = process.argv[2] ?? ".env.live";
process.loadEnvFile(envDatei);
const BEHALTEN = 12;

function env(name: string): string {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt in ${envDatei}`);
  return wert;
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const schluessel = env("SUPABASE_SECRET_KEY");
  const projekt = new URL(url).hostname.split(".")[0];
  const db = createClient(url, schluessel, { auth: { persistSession: false } });

  const basis = process.env.BACKUP_ORDNER || join(homedir(), "Desktop", "APP-Backups");
  const stempel = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "_").replace(/:/g, "-");
  const ziel = join(basis, projekt, stempel);
  mkdirSync(join(ziel, "tabellen"), { recursive: true });
  console.log(`Sichere ${projekt} nach ${ziel}`);

  // 1. Tabellen: Liste aus der REST-Beschreibung der Datenbank (nur Tabellen/Ansichten, die die Schnittstelle kennt)
  const antwort = await fetch(`${url}/rest/v1/`, { headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/openapi+json" } });
  if (!antwort.ok) throw new Error(`Tabellenliste nicht lesbar (${antwort.status})`);
  const beschreibung = (await antwort.json()) as { definitions?: Record<string, unknown> };
  const tabellen = Object.keys(beschreibung.definitions ?? {}).sort();
  const zaehler: Record<string, number> = {};
  for (const t of tabellen) {
    const zeilen: unknown[] = [];
    for (let von = 0; ; von += 1000) {
      const { data, error } = await db.from(t).select("*").range(von, von + 999);
      if (error) throw new Error(`Tabelle ${t}: ${error.message}`);
      zeilen.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    writeFileSync(join(ziel, "tabellen", `${t}.json`), JSON.stringify(zeilen));
    zaehler[t] = zeilen.length;
  }
  console.log(`  ${tabellen.length} Tabellen, ${Object.values(zaehler).reduce((a, b) => a + b, 0)} Zeilen`);

  // 2. Nutzerliste (ohne Passwörter, die gibt Supabase nicht heraus)
  const nutzer: unknown[] = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await db.auth.admin.listUsers({ page: seite, perPage: 1000 });
    if (error) throw new Error(`Nutzerliste: ${error.message}`);
    nutzer.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.user_metadata })));
    if (data.users.length < 1000) break;
  }
  writeFileSync(join(ziel, "nutzer.json"), JSON.stringify(nutzer, null, 1));
  console.log(`  ${nutzer.length} Nutzer`);

  // 3. Dateien aller Speicher-Bereiche (Buckets), Ordner rekursiv
  const { data: buckets, error: bFehler } = await db.storage.listBuckets();
  if (bFehler) throw new Error(`Speicher: ${bFehler.message}`);
  const dateien: Record<string, number> = {};
  for (const b of buckets ?? []) {
    let anzahl = 0;
    const ordnerAblaufen = async (pfad: string): Promise<void> => {
      for (let von = 0; ; von += 1000) {
        const { data, error } = await db.storage.from(b.name).list(pfad, { limit: 1000, offset: von });
        if (error) throw new Error(`Speicher ${b.name}/${pfad}: ${error.message}`);
        for (const e of data ?? []) {
          const voll = pfad ? `${pfad}/${e.name}` : e.name;
          if (e.id === null) { await ordnerAblaufen(voll); continue; } // Ordner
          const { data: blob, error: dFehler } = await db.storage.from(b.name).download(voll);
          if (dFehler || !blob) { console.warn(`  ! ${b.name}/${voll} nicht geladen`); continue; }
          const datei = join(ziel, "dateien", b.name, ...voll.split("/"));
          mkdirSync(dirname(datei), { recursive: true });
          writeFileSync(datei, new Uint8Array(await blob.arrayBuffer()));
          anzahl++;
        }
        if (!data || data.length < 1000) break;
      }
    };
    await ordnerAblaufen("");
    dateien[b.name] = anzahl;
  }
  console.log(`  ${Object.values(dateien).reduce((a, b) => a + b, 0)} Dateien in ${Object.keys(dateien).length} Speicher-Bereichen`);

  writeFileSync(join(ziel, "inhalt.json"), JSON.stringify({ projekt, erstellt: new Date().toISOString(), tabellen: zaehler, nutzer: nutzer.length, dateien }, null, 1));

  // 4. Alte Sicherungen aufräumen (die neuesten 12 bleiben)
  const alle = readdirSync(join(basis, projekt)).filter((n) => /^\d{4}-\d{2}-\d{2}_/.test(n)).sort();
  for (const alt of alle.slice(0, Math.max(0, alle.length - BEHALTEN))) rmSync(join(basis, projekt, alt), { recursive: true, force: true });
  console.log("Fertig.");
}

main().catch((e) => {
  console.error(`Backup fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
