"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { formatDatum } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { zeitDatenSchema, zeitZeile, type GepruefteZeitDaten } from "@/lib/zeit-schema";
import { ueberschneidetSich, uhrzeitKurz } from "@/lib/zeiten";

// Zeiten nachtragen, ändern und löschen (= archivieren) durch Büro und Admin.
// Verbindlich regelt die Datenbank die Rechte (RLS); jede Aktion prüft die
// Rolle zusätzlich selbst. Anlegen ist idempotent: die ID kommt vom Formular,
// ein zweites Senden (Doppelklick, Funkloch) speichert nichts doppelt.

export type BueroZeitErgebnis = { fehler?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;
const uuid = z.uuid();

function aktualisieren() {
  revalidatePath("/buero/zeiten", "layout");
  revalidatePath("/zeiten", "layout");
  revalidatePath("/heute");
}

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23P01") {
    return "Die Zeit überschneidet sich mit einem schon gespeicherten Eintrag dieser Person. Zeiten dürfen sich nicht überlappen, direkt anschließen geht.";
  }
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

/** Überschneidet sich die Zeit mit einem anderen Eintrag derselben Person am selben Tag? */
async function ueberschneidung(
  supabase: Supabase,
  userId: string,
  d: GepruefteZeitDaten,
  ausserId: string,
): Promise<string | null> {
  if (d.modus !== "uhrzeit") return null;
  const { data } = await supabase
    .from("time_entries")
    .select("id, von, bis, projects(name)")
    .eq("user_id", userId)
    .eq("datum", d.datum)
    .is("archiviert_am", null)
    .not("von", "is", null)
    .neq("id", ausserId);
  const treffer = (data ?? []).find(
    (t) => t.von && t.bis && ueberschneidetSich({ von: d.von, bis: d.bis }, { von: uhrzeitKurz(t.von), bis: uhrzeitKurz(t.bis) }),
  );
  if (!treffer) return null;
  const wo = treffer.projects?.name ? ` (${treffer.projects.name})` : "";
  return `Am ${formatDatum(d.datum)} ist schon ${uhrzeitKurz(treffer.von)}–${uhrzeitKurz(treffer.bis)}${wo} eingetragen. Zeiten dürfen sich nicht überschneiden.`;
}

const anlegenSchema = z.object({ eintragId: uuid, userId: uuid, daten: zeitDatenSchema });

/** Zeit für einen Mitarbeiter nachtragen. */
export async function bueroZeitAnlegen(eingabe: unknown): Promise<BueroZeitErgebnis> {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const pruefung = anlegenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const { eintragId, userId, daten: d } = pruefung.data;

  const supabase = await createClient();

  // Schon gespeichert? (zweiter Versuch nach Doppelklick oder Funkloch)
  const { data: vorhanden } = await supabase.from("time_entries").select("id").eq("id", eintragId).maybeSingle();
  if (vorhanden) return {};

  const { data: person } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!person) return { fehler: "Diesen Mitarbeiter gibt es nicht." };

  const konflikt = await ueberschneidung(supabase, userId, d, eintragId);
  if (konflikt) return { fehler: konflikt };

  const { error } = await supabase
    .from("time_entries")
    .insert({ ...zeitZeile(d), id: eintragId, user_id: userId, erstellt_von: nutzer.id });
  if (error) {
    // Ging die erste Anfrage doch durch? Dann ist alles gut.
    const { data: nachher } = await supabase.from("time_entries").select("id").eq("id", eintragId).maybeSingle();
    if (!nachher) return { fehler: dbMeldung(error) };
  }

  aktualisieren();
  return {};
}

/** Zeit eines Mitarbeiters ändern (Mitarbeiter und Ersteller bleiben gleich). */
export async function bueroZeitAendern(id: string, eingabe: unknown): Promise<BueroZeitErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };
  const pruefung = zeitDatenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const d = pruefung.data;

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("time_entries")
    .select("id, user_id, archiviert_am")
    .eq("id", id)
    .maybeSingle();
  if (!alt) return { fehler: "Diesen Eintrag gibt es nicht (mehr)." };
  if (alt.archiviert_am) return { fehler: "Dieser Eintrag wurde gelöscht." };

  const konflikt = await ueberschneidung(supabase, alt.user_id, d, id);
  if (konflikt) return { fehler: konflikt };

  const { data, error } = await supabase.from("time_entries").update(zeitZeile(d)).eq("id", id).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Dieser Eintrag kann nicht geändert werden." };

  aktualisieren();
  return {};
}

/** Zeit löschen = archivieren. Der Eintrag bleibt im Protokoll (audit_log) erhalten. */
export async function bueroZeitArchivieren(id: string): Promise<BueroZeitErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };

  const supabase = await createClient();
  const { data: alt } = await supabase.from("time_entries").select("id, archiviert_am").eq("id", id).maybeSingle();
  if (!alt) return { fehler: "Diesen Eintrag gibt es nicht (mehr)." };
  if (alt.archiviert_am) return {}; // schon erledigt (zweiter Versuch)

  const { data, error } = await supabase
    .from("time_entries")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Dieser Eintrag kann nicht gelöscht werden." };

  aktualisieren();
  return {};
}
