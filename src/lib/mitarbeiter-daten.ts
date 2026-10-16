import "server-only";
import { createClient } from "@/lib/supabase/server";

// Gemeinsame Abfragen für die Mitarbeiter-Ansicht.
// WICHTIG: Immer ausdrücklich nach dem eingeloggten Nutzer filtern. Büro/Admin
// dürfen per RLS alles sehen, in der Mitarbeiter-Ansicht sollen aber auch sie
// nur IHRE Einsätze und Baustellen sehen.

export type Kollege = { id: string; vorname: string; nachname: string; telefon: string | null };

/** Name + Telefon aller aktiven Kollegen (über die DB-Funktion kollegen()). */
export async function kollegenLaden(): Promise<Map<string, Kollege>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("kollegen");
  return new Map((data ?? []).map((k) => [k.id, k]));
}

/** IDs der Projekte, auf denen der Nutzer eingetragen ist. */
export async function meineProjektIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("project_members").select("project_id").eq("user_id", userId);
  return (data ?? []).map((m) => m.project_id);
}

/** Einsätze des Nutzers an einem Tag, inklusive ganzem Team. */
export async function meineEinsaetze(userId: string, datum: string) {
  const supabase = await createClient();
  const { data: meine } = await supabase
    .from("assignment_members")
    .select("assignment_id, assignments!inner(datum)")
    .eq("user_id", userId)
    .eq("assignments.datum", datum);
  const ids = (meine ?? []).map((m) => m.assignment_id);
  if (!ids.length) return [];

  const { data } = await supabase
    .from("assignments")
    .select(
      `id, notiz,
       vehicles(name, kennzeichen),
       assignment_stops(id, sortierung, zeit, zeit_art, notiz,
         projects(id, name, baustelle_strasse, baustelle_plz, baustelle_ort, buero_ansprechpartner_id,
           contacts(firmenname, anrede, vorname, nachname, ansprechpartner, telefon, mobil))),
       assignment_members(user_id)`,
    )
    .in("id", ids);
  return data ?? [];
}
