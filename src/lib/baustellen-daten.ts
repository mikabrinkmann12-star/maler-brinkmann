import "server-only";
import type { AktuellerNutzer } from "@/lib/auth";
import type { AufmassEinheit } from "@/lib/aufmass";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

// Gemeinsame Abfragen für die Unterseiten einer Baustelle (Aufmaß …).

/** Projekt mit Rechten des Nutzers – oder null, wenn er es nicht sehen darf (RLS). */
export async function baustelleMitRechten(nutzer: AktuellerNutzer, projektId: string) {
  const supabase = await createClient();
  const [{ data: projekt }, { data: mitglied }] = await Promise.all([
    supabase.from("projects").select("id, name, archiviert_am").eq("id", projektId).maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", projektId).eq("user_id", nutzer.id).maybeSingle(),
  ]);
  if (!projekt) return null;
  const istBuero = istBueroRolle(nutzer.rolle);
  const istMitglied = Boolean(mitglied);
  return {
    projekt,
    istBuero,
    istMitglied,
    /** Fotos, Notizen, Material, Aufmaß anlegen */
    darfInhalte: (istMitglied || istBuero) && !projekt.archiviert_am,
    /** Eigene Einträge ändern/löschen (Büro: alle) */
    darfAendern: (erstelltVon: string | null) => istBuero || (erstelltVon === nutzer.id && istMitglied),
  };
}

export type AufmassZeile = {
  id: string;
  raum: string;
  position: string;
  einheit: AufmassEinheit;
  laenge: number | null;
  hoehe: number | null;
  anzahl: number;
  menge: number;
  bemerkung: string;
  erstelltVon: string | null;
  erstelltAm: string;
  abzuege: { bezeichnung: string; breite: number; hoehe: number; anzahl: number }[];
};

/** Alle aktuellen Aufmaß-Zeilen einer Baustelle (ohne archivierte), älteste zuerst. */
export async function aufmassLaden(projektId: string): Promise<AufmassZeile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("measurements")
    .select("id, raum, position, einheit, laenge, hoehe, anzahl, menge, bemerkung, erstellt_von, created_at, measurement_deductions(bezeichnung, breite, hoehe, anzahl, created_at)")
    .eq("project_id", projektId)
    .is("archiviert_am", null)
    .order("created_at");
  return (data ?? []).map((m) => ({
    id: m.id,
    raum: m.raum,
    position: m.position,
    einheit: m.einheit,
    laenge: m.laenge == null ? null : Number(m.laenge),
    hoehe: m.hoehe == null ? null : Number(m.hoehe),
    anzahl: Number(m.anzahl),
    menge: Number(m.menge),
    bemerkung: m.bemerkung ?? "",
    erstelltVon: m.erstellt_von,
    erstelltAm: m.created_at,
    abzuege: [...m.measurement_deductions]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({ bezeichnung: a.bezeichnung, breite: Number(a.breite), hoehe: Number(a.hoehe), anzahl: Number(a.anzahl) })),
  }));
}
