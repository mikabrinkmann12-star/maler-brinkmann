import "server-only";
import { monatsGrenzen } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import type { AuswertungEintrag } from "@/lib/zeiten-auswertung";

// Abfragen für die Zeiten-Übersicht im Büro. Wer sie aufruft, hat vorher
// requireRole(BUERO_ROLLEN) geprüft; verbindlich begrenzt die Datenbank (RLS).

export type BueroPerson = { id: string; name: string; aktiv: boolean };

/** Alle Personen (auch gesperrte, ihre Zeiten bleiben sichtbar), nach Name sortiert. */
export async function bueroPersonen(): Promise<BueroPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, vorname, nachname, aktiv");
  if (error) throw new Error("Die Mitarbeiter konnten nicht geladen werden.");
  return data
    .map((p) => ({ id: p.id, name: `${p.vorname} ${p.nachname}`.trim(), aktiv: p.aktiv }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function personenNamen(personen: BueroPerson[]): Map<string, string> {
  return new Map(personen.map((p) => [p.id, p.name]));
}

const SEITE = 1000; // so viele Zeilen liefert die Datenbank höchstens pro Abfrage

/** Alle nicht gelöschten (archivierten) Zeiten eines Monats. */
export async function monatsEintraege(monat: string): Promise<AuswertungEintrag[]> {
  const { erster, letzter } = monatsGrenzen(monat);
  return zeitraumEintraege(erster, letzter);
}

/** Alle nicht archivierten Zeiten zwischen zwei Tagen (einschließlich), mit Zeitpunkt der letzten Änderung. */
export async function zeitraumEintraege(erster: string, letzter: string): Promise<AuswertungEintrag[]> {
  const supabase = await createClient();
  const ergebnis: AuswertungEintrag[] = [];

  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, user_id, datum, von, bis, pause_min, stunden, art, beschreibung, project_id, updated_at, bearbeitet_von, projects(name, projektnummer)")
      .is("archiviert_am", null)
      .gte("datum", erster)
      .lte("datum", letzter)
      .order("datum")
      .order("id") // stabile Reihenfolge, sonst können beim Blättern Zeilen doppelt oder gar nicht kommen
      .range(von, von + SEITE - 1);
    if (error) throw new Error("Die Zeiten konnten nicht geladen werden.");

    for (const t of data) {
      ergebnis.push({
        id: t.id,
        userId: t.user_id,
        datum: t.datum,
        von: t.von,
        bis: t.bis,
        pauseMin: t.pause_min,
        stunden: Number(t.stunden),
        art: t.art,
        projektId: t.project_id,
        projektName: t.projects?.name ?? "",
        projektNummer: t.projects?.projektnummer ?? "",
        beschreibung: t.beschreibung ?? "",
        bearbeitetAm: t.updated_at,
        bearbeitetVon: t.bearbeitet_von ?? undefined,
      });
    }
    if (data.length < SEITE) return ergebnis;
  }
}
