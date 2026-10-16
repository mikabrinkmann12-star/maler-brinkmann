import "server-only";
import type { AktuellerNutzer } from "@/lib/auth";
import { heuteIso, monatVerschieben } from "@/lib/datum";
import { kollegenLaden, meineProjektIds } from "@/lib/mitarbeiter-daten";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import {
  einstellungenLesen,
  fruehesterAenderbarerTag,
  uhrzeitKurz,
  type ZeitArt,
  type ZeiterfassungEinstellungen,
} from "@/lib/zeiten";

// Abfragen für die Zeiterfassung in der Mitarbeiter-Ansicht.
// Wie in mitarbeiter-daten.ts: immer ausdrücklich nach dem Nutzer filtern.

/** Einstellungen „Zeiterfassung“ aus app_settings (alle aktiven Nutzer dürfen lesen). */
export async function zeiterfassungEinstellungen(): Promise<ZeiterfassungEinstellungen> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("wert")
    .eq("schluessel", "zeiterfassung")
    .maybeSingle();
  return einstellungenLesen(data?.wert);
}

export type FormularProjekt = { id: string; name: string; ort: string };
export type FormularPerson = { id: string; name: string; vorname: string };
export type FormularEinsatz = { datum: string; projektId: string; team: string[] };
export type FormularEintrag = {
  id: string;
  datum: string;
  von: string;
  bis: string;
  pauseMin: number;
  stunden: number;
  art: ZeitArt;
  projektId: string | null;
  projektName: string;
};

export type ZeitFormularDaten = {
  ich: { id: string; vorname: string };
  heute: string;
  /** Frühester/spätester wählbarer Tag (Büro/Admin: keine Grenze). */
  minDatum: string | null;
  maxDatum: string | null;
  einstellungen: ZeiterfassungEinstellungen;
  darfAlles: boolean;
  projekte: FormularProjekt[];
  /** Projekt-ID → Nutzer-IDs der Baustelle (ohne mich, nur aktive). */
  mitglieder: Record<string, string[]>;
  personen: FormularPerson[];
  einsaetze: FormularEinsatz[];
  eintraege: FormularEintrag[];
};

/** Alles, was das Formular „Zeit eintragen“ braucht – für alle wählbaren Tage auf einmal. */
export async function zeitFormularDaten(nutzer: AktuellerNutzer): Promise<ZeitFormularDaten> {
  const supabase = await createClient();
  const heute = heuteIso();
  const darfAlles = istBueroRolle(nutzer.rolle);
  const [einstellungen, projektIds, kollegen] = await Promise.all([
    zeiterfassungEinstellungen(),
    meineProjektIds(nutzer.id),
    kollegenLaden(),
  ]);

  const minDatum = darfAlles ? null : fruehesterAenderbarerTag(heute, einstellungen.kulanzTage);
  // Vorschläge (Einsatz, letzte Uhrzeit) gibt es für den Vormonat und diesen Monat.
  const ladenAb = minDatum ?? `${monatVerschieben(heute.slice(0, 7), -1)}-01`;

  const [projekte, mitglieder, einsaetze, eintraege] = await Promise.all([
    projektIds.length
      ? supabase.from("projects").select("id, name, baustelle_ort").in("id", projektIds).is("archiviert_am", null).order("name")
      : Promise.resolve({ data: [] }),
    projektIds.length
      ? supabase.from("project_members").select("project_id, user_id").in("project_id", projektIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("assignment_members")
      .select("assignments!inner(datum, project_id, assignment_members(user_id))")
      .eq("user_id", nutzer.id)
      .gte("assignments.datum", ladenAb)
      .lte("assignments.datum", heute),
    supabase
      .from("time_entries")
      .select("id, datum, von, bis, pause_min, stunden, art, project_id, projects(name)")
      .eq("user_id", nutzer.id)
      .is("archiviert_am", null)
      .gte("datum", ladenAb)
      .lte("datum", heute)
      .order("von"),
  ]);

  const mitgliederJeProjekt: Record<string, string[]> = {};
  for (const m of mitglieder.data ?? []) {
    if (m.user_id === nutzer.id || !kollegen.has(m.user_id)) continue;
    (mitgliederJeProjekt[m.project_id] ??= []).push(m.user_id);
  }

  return {
    ich: { id: nutzer.id, vorname: nutzer.vorname },
    heute,
    minDatum,
    maxDatum: darfAlles ? null : heute,
    einstellungen,
    darfAlles,
    projekte: (projekte.data ?? []).map((p) => ({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" })),
    mitglieder: mitgliederJeProjekt,
    personen: [...kollegen.values()]
      .filter((k) => k.id !== nutzer.id)
      .map((k) => ({ id: k.id, vorname: k.vorname, name: `${k.vorname} ${k.nachname}`.trim() })),
    einsaetze: (einsaetze.data ?? [])
      .map((e) => e.assignments)
      .filter((a) => a.project_id)
      .map((a) => ({
        datum: a.datum,
        projektId: a.project_id as string,
        team: a.assignment_members.map((m) => m.user_id).filter((id) => id !== nutzer.id),
      })),
    eintraege: (eintraege.data ?? []).map((t) => ({
      id: t.id,
      datum: t.datum,
      von: uhrzeitKurz(t.von),
      bis: uhrzeitKurz(t.bis),
      pauseMin: t.pause_min,
      stunden: t.stunden,
      art: t.art,
      projektId: t.project_id,
      projektName: t.projects?.name ?? "",
    })),
  };
}
