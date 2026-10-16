import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TerminZeile = {
  id: string;
  datum: string;
  titel: string;
  zeit: string;
  ort: string;
  notiz: string;
  projectId: string | null;
  projektName: string;
  erstelltVon: string | null;
  personIds: string[];
};

/** Termine ab einem Datum (nicht archiviert). `nurPerson` = nur Termine dieser Person (Mitarbeiter-Ansicht). */
export async function termineLaden(opts: { ab: string; bis?: string; nurPerson?: string }): Promise<TerminZeile[]> {
  const supabase = await createClient();
  let abfrage = supabase
    .from("appointments")
    .select("id, datum, titel, zeit, ort, notiz, project_id, erstellt_von, projects(name), appointment_members(user_id)")
    .is("archiviert_am", null)
    .gte("datum", opts.ab)
    .order("datum")
    .order("zeit", { nullsFirst: false });
  if (opts.bis) abfrage = abfrage.lte("datum", opts.bis);
  const { data } = await abfrage;
  return (data ?? [])
    .map((t) => ({
      id: t.id,
      datum: t.datum,
      titel: t.titel,
      zeit: t.zeit ? t.zeit.slice(0, 5) : "",
      ort: t.ort ?? "",
      notiz: t.notiz ?? "",
      projectId: t.project_id,
      projektName: t.projects?.name ?? "",
      erstelltVon: t.erstellt_von,
      personIds: t.appointment_members.map((m) => m.user_id),
    }))
    .filter((t) => !opts.nurPerson || t.personIds.includes(opts.nurPerson) || t.erstelltVon === opts.nurPerson);
}
