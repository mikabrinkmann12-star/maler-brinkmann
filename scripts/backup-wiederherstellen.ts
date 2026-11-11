// Wiederherstellen aus einem eigenen Backup (scripts/backup.ts): fügt FEHLENDE Zeilen und Dateien wieder ein,
// überschreibt nie etwas, das noch da ist. Typischer Fall: Kontakte oder Fotos wurden aus Versehen gelöscht.
//
//   npm run backup:zurueck -- <Backup-Ordner>                     → Probelauf gegen dev (.env.local), zählt nur
//   npm run backup:zurueck -- <Backup-Ordner> .env.local --ja     → wirklich einfügen in dev
//   npm run backup:zurueck -- <Backup-Ordner> .env.live --ja      → wirklich einfügen in live (nur im Notfall!)
//
// Nutzer (Logins) stellt das Skript NICHT her: Fehlt ein Nutzer, legt ihn der Admin neu an (Nutzerverwaltung),
// sonst scheitern seine Zeilen. Anleitung: docs/BACKUP.md
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";

const [ordner, envDatei = ".env.local", ...rest] = process.argv.slice(2);
const wirklich = rest.includes("--ja") || envDatei === "--ja";
const zielEnv = envDatei === "--ja" ? ".env.local" : envDatei;
if (!ordner || !existsSync(join(ordner, "inhalt.json"))) {
  console.error("Bitte den Backup-Ordner angeben (der mit inhalt.json), z. B.: npm run backup:zurueck -- \"C:\\Users\\…\\APP-Backups\\<projekt>\\2026-11-12_09-00-00\"");
  process.exit(1);
}
process.loadEnvFile(zielEnv);

function env(name: string): string {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt in ${zielEnv}`);
  return wert;
}

type Zeile = Record<string, unknown>;

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const db = createClient(url, env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
  const ziel = new URL(url).hostname.split(".")[0];
  const inhalt = JSON.parse(readFileSync(join(ordner, "inhalt.json"), "utf8")) as { projekt: string; erstellt: string };
  console.log(`Backup von ${inhalt.projekt} (${inhalt.erstellt}) → Ziel ${ziel}${wirklich ? "" : " (PROBELAUF, es wird nichts geändert)"}`);
  if (inhalt.projekt !== ziel) console.warn("  Achtung: Backup und Ziel sind verschiedene Projekte. Zeilen mit Nutzern aus dem anderen Projekt werden scheitern.");

  // Tabellen: fehlende Zeilen einfügen. Mehrere Durchgänge, weil Tabellen aufeinander verweisen (Reihenfolge unbekannt).
  const tabellenOrdner = join(ordner, "tabellen");
  let offen = readdirSync(tabellenOrdner).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  const fehler = new Map<string, string>();
  let eingefuegt = 0;
  for (let durchgang = 1; durchgang <= 6 && offen.length; durchgang++) {
    const naechste: string[] = [];
    for (const t of offen) {
      let zeilen = JSON.parse(readFileSync(join(tabellenOrdner, `${t}.json`), "utf8")) as Zeile[];
      if (!zeilen.length) continue;
      // Was fehlt? (über die Spalte id, sonst gilt die ganze Tabelle als „vielleicht fehlend“ und wird mit ignore-duplicates geschickt)
      if ("id" in zeilen[0]) {
        const vorhanden = new Set<unknown>();
        for (let von = 0; ; von += 1000) {
          const { data, error } = await db.from(t).select("id").range(von, von + 999);
          if (error) break;
          for (const z of data ?? []) vorhanden.add((z as Zeile).id);
          if (!data || data.length < 1000) break;
        }
        zeilen = zeilen.filter((z) => !vorhanden.has(z.id));
      }
      if (!zeilen.length) continue;
      const mitId = "id" in zeilen[0];
      if (!wirklich) {
        // Ohne id-Spalte (z. B. Einstellungen) lässt sich vorab nicht zählen; dort wird beim Einfügen nur Fehlendes ergänzt
        if (mitId) console.log(`  ${t}: ${zeilen.length} Zeilen fehlen`);
        continue;
      }
      let ok = true;
      for (let i = 0; i < zeilen.length && ok; i += 500) {
        let paket = zeilen.slice(i, i + 500);
        for (let versuch = 0; versuch < 5; versuch++) {
          const { error } = await db.from(t).upsert(paket, { ignoreDuplicates: true });
          if (!error) { if (mitId) eingefuegt += paket.length; break; }
          // Berechnete Spalten (z. B. Verkaufspreis) lassen sich nicht schreiben: Spalte weglassen und nochmal
          const spalte = /column "([^"]+)"/.exec(error.message)?.[1];
          if (spalte && /DEFAULT|generated/i.test(error.message)) {
            paket = paket.map((z) => Object.fromEntries(Object.entries(z).filter(([k]) => k !== spalte)));
            continue;
          }
          fehler.set(t, error.message);
          ok = false;
          break;
        }
      }
      if (!ok) naechste.push(t);
      else fehler.delete(t);
    }
    offen = naechste;
  }
  if (wirklich) console.log(`  ${eingefuegt} fehlende Zeilen wieder eingefügt (Tabellen ohne id-Spalte nur abgeglichen, nichts überschrieben)`);
  for (const [t, m] of fehler) console.warn(`  ! ${t}: ${m}`);

  // Dateien: fehlende wieder hochladen
  const dateienOrdner = join(ordner, "dateien");
  let hochgeladen = 0;
  let fehlend = 0;
  if (existsSync(dateienOrdner)) {
    const ablaufen = (o: string): string[] => readdirSync(o).flatMap((n) => (statSync(join(o, n)).isDirectory() ? ablaufen(join(o, n)) : [join(o, n)]));
    for (const datei of ablaufen(dateienOrdner)) {
      const [bucket, ...teile] = relative(dateienOrdner, datei).split(sep);
      const pfad = teile.join("/");
      const ordnerPfad = teile.slice(0, -1).join("/");
      const { data } = await db.storage.from(bucket).list(ordnerPfad, { search: teile.at(-1), limit: 5 });
      if (data?.some((e) => e.name === teile.at(-1))) continue;
      fehlend++;
      if (!wirklich) continue;
      const { error } = await db.storage.from(bucket).upload(pfad, readFileSync(datei), { upsert: false });
      if (error) console.warn(`  ! ${bucket}/${pfad}: ${error.message}`);
      else hochgeladen++;
    }
  }
  console.log(wirklich ? `  ${hochgeladen} Dateien wieder hochgeladen` : `  ${fehlend} Dateien fehlen`);
  console.log(wirklich ? "Fertig." : "Probelauf fertig. Zum Einfügen denselben Befehl mit Env-Datei und --ja am Ende starten.");
}

main().catch((e) => {
  console.error(`Wiederherstellen fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
