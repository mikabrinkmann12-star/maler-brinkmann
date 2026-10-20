import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gemeinsamer Anfang der Projekt-Reiter (Ablage, Material, Arbeitsanweisungen …):
 * prüft Anmeldung und Sichtbarkeit (RLS) und liefert Rechte und Namen der Kollegen.
 */
export async function projektKontext(id: string) {
  const nutzer = await requireUser();
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: projekt }, { data: mitglied }, kollegen] = await Promise.all([
    supabase.from("projects").select("id, name, archiviert_am").eq("id", id).maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", id).eq("user_id", nutzer.id).maybeSingle(),
    kollegenLaden(),
  ]);
  if (!projekt) notFound();
  const istBuero = istBueroRolle(nutzer.rolle);
  const istMitglied = Boolean(mitglied);
  return {
    supabase,
    nutzer,
    projekt,
    kollegen,
    istBuero,
    istMitglied,
    archiviert: Boolean(projekt.archiviert_am),
    /** Fotos, Notizen, Material, Aufmaß anlegen */
    darfInhalte: (istMitglied || istBuero) && !projekt.archiviert_am,
    /** Name eines Erstellers („Du“, Kollege oder „Ehemaliger Kollege“) */
    wer: (uid: string | null) => {
      if (uid === nutzer.id) return "Du";
      const k = uid ? kollegen.get(uid) : undefined;
      return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
    },
    /** Eigene Einträge entfernen (Büro: alle) */
    darfLoeschen: (uid: string | null) => istBuero || (uid === nutzer.id && istMitglied),
  };
}
